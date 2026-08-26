// Pure functions for parsing a forwarded bank-alert email against a set of
// per-household regex rules. No I/O - the route handler does the DB work.

import { cleanTitle } from './title'

export type IngestRule = {
  id: string
  name: string
  enabled: boolean
  match_from: string | null
  match_subject: string | null
  amount_regex: string
  description_regex: string | null
  date_regex: string | null
  direction: 'outflow' | 'inflow' | 'auto'
  inflow_regex: string | null
  // When set, the engine runs this regex against the body and uses capture
  // group 1 to look up an account by last_four. Falls back to default_account_id
  // if the regex doesn't match or no account has that last_four.
  account_router_regex: string | null
  default_account_id: string | null
  default_member_id: string | null
  default_category_id: string | null
}

// Tiny lookup of a household's accounts so the engine can resolve the
// router regex's captured discriminator into an account id, and default the
// transaction's member from the account's owner.
export type AccountLookup = {
  id: string
  last_four: string | null
  ownership?: 'member' | 'shared'
  member_id?: string | null
}

export type IngestEmail = {
  from: string
  subject: string
  body: string
  message_id: string
  received_at: string         // ISO timestamp (RFC 3339)
}

export type ParsedTx = {
  occurred_on: string         // YYYY-MM-DD
  amount_cents: number        // signed: positive = outflow
  description: string | null
  account_id: string | null
  member_id: string | null
  category_id: string | null
  external_id: string         // email Message-ID
  matched_rule_id: string
}

export type ParseOutcome =
  | { ok: true; tx: ParsedTx }
  | { ok: false; reason: 'no_match' | 'parse_error'; detail?: string; matched_rule_id?: string }

function safeRegex(src: string, flags = 'i'): RegExp | null {
  try { return new RegExp(src, flags) } catch { return null }
}

function ruleMatches(rule: IngestRule, email: IngestEmail): boolean {
  if (rule.match_from) {
    const re = safeRegex(rule.match_from)
    if (!re || !re.test(email.from)) return false
  }
  if (rule.match_subject) {
    const re = safeRegex(rule.match_subject)
    if (!re || !re.test(email.subject)) return false
  }
  return true
}

function parseAmountCents(raw: string): number | null {
  // Canadian / North-American formatting: ',' groups thousands, '.' is the
  // decimal, and a minus may lead or trail (some banks render '25.00-').
  // Strip currency symbols and grouping deterministically, then parse.
  const negative = /^\s*-/.test(raw) || /-\s*$/.test(raw)
  let s = raw.replace(/[^0-9.]/g, '') // drop currency, spaces, commas, signs
  if (!s) return null
  // Collapse stray dots (e.g. '1.234.56' → '1234.56'): keep only the last as
  // the decimal point, treat earlier ones as grouping.
  const lastDot = s.lastIndexOf('.')
  if (lastDot !== -1) {
    s = s.slice(0, lastDot).replace(/\./g, '') + '.' + s.slice(lastDot + 1)
  }
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  const cents = Math.round(n * 100)
  return negative ? -cents : cents
}

function normalizeDate(raw: string, fallbackISO: string): string {
  // Accept YYYY-MM-DD, M/D/YYYY, D/M/YYYY (best-effort), or fall back.
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const m = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    // Heuristic: if first number > 12 it's day-first, else month-first.
    const day = a > 12 ? a : b
    const month = a > 12 ? b : a
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  // Fallback: take the date portion of the email's received_at.
  return fallbackISO.slice(0, 10)
}

export function parseEmail(
  rules: IngestRule[],
  email: IngestEmail,
  accounts: AccountLookup[] = [],
): ParseOutcome {
  const enabledRules = rules.filter((r) => r.enabled)
  const candidates = enabledRules.filter((r) => ruleMatches(r, email))
  if (candidates.length === 0) return { ok: false, reason: 'no_match' }

  // Remember the closest candidate that matched from/subject but failed to
  // yield an amount, so we can report a useful parse_error (with the rule id)
  // instead of a bare no_match when nothing parses.
  let nearMiss: { matched_rule_id: string; detail: string } | null = null

  for (const rule of candidates) {
    const amountRe = safeRegex(rule.amount_regex)
    if (!amountRe) {
      nearMiss = { matched_rule_id: rule.id, detail: 'amount_regex is not a valid regular expression.' }
      continue
    }
    const amountMatch = email.body.match(amountRe)
    if (!amountMatch) {
      nearMiss = { matched_rule_id: rule.id, detail: 'amount_regex matched no amount in the email body.' }
      continue
    }
    const captured = amountMatch[1] ?? amountMatch[0]
    const absCents = parseAmountCents(captured)
    if (absCents === null) {
      // Don't abort the whole candidate list - a later rule may parse cleanly.
      nearMiss = { matched_rule_id: rule.id, detail: `Amount capture "${captured}" did not parse to a number.` }
      continue
    }

    let capturedDesc: string | null = null
    if (rule.description_regex) {
      const re = safeRegex(rule.description_regex)
      const m = re ? email.body.match(re) : null
      capturedDesc = m ? (m[1] ?? m[0]).trim() : null
    }
    // Tidy the captured merchant ("TIM HORTONS #5" → "Tim Hortons"); fall back
    // to the email subject when nothing usable was captured.
    let description = cleanTitle(capturedDesc)
    if (!description) description = email.subject?.trim() || null

    let occurredOn: string
    if (rule.date_regex) {
      const re = safeRegex(rule.date_regex)
      const m = re ? email.body.match(re) : null
      occurredOn = m ? normalizeDate(m[1] ?? m[0], email.received_at) : email.received_at.slice(0, 10)
    } else {
      occurredOn = email.received_at.slice(0, 10)
    }

    let signedCents: number
    if (rule.direction === 'outflow') signedCents = Math.abs(absCents)
    else if (rule.direction === 'inflow') signedCents = -Math.abs(absCents)
    else {
      // auto
      const inflowRe = rule.inflow_regex ? safeRegex(rule.inflow_regex) : null
      const isInflow = inflowRe ? inflowRe.test(email.body) : false
      signedCents = isInflow ? -Math.abs(absCents) : Math.abs(absCents)
    }

    // Account routing - try the rule's router regex first, then fall back
    // to the rule's default. This is what lets one RBC rule serve chequing,
    // savings, and credit cards: the body says "ending in 1234" and we look
    // up the account whose last_four matches.
    let routedAccountId = rule.default_account_id
    if (rule.account_router_regex) {
      const routerRe = safeRegex(rule.account_router_regex)
      const m = routerRe ? email.body.match(routerRe) : null
      // Normalize to trailing 4 digits so '*1234', 'XXXX1234', '...1234',
      // ' 1234 ' all resolve to the account whose last_four is '1234'.
      const captured = m && m[1] ? m[1].replace(/\D/g, '').slice(-4) : null
      if (captured && captured.length === 4) {
        const matched = accounts.find(
          (a) => a.last_four && a.last_four.replace(/\D/g, '').slice(-4) === captured,
        )
        if (matched) routedAccountId = matched.id
      }
    }

    // Member resolution: an explicit rule default wins; otherwise the
    // transaction follows the routed account's owner - a member-owned account
    // makes it personal to that member, a shared account leaves it shared.
    // This is multi-member correct: each member's own accounts route to them.
    let memberId = rule.default_member_id
    if (!memberId) {
      const routed = accounts.find((a) => a.id === routedAccountId)
      memberId = routed && routed.ownership === 'member' ? routed.member_id ?? null : null
    }

    return {
      ok: true,
      tx: {
        occurred_on: occurredOn,
        amount_cents: signedCents,
        description,
        account_id: routedAccountId,
        member_id: memberId,
        category_id: rule.default_category_id,
        external_id: email.message_id,
        matched_rule_id: rule.id,
      },
    }
  }

  // A rule fired on from/subject but no candidate produced a parseable amount:
  // report it as a parse_error against that rule so the log is actionable.
  if (nearMiss) {
    return { ok: false, reason: 'parse_error', detail: nearMiss.detail, matched_rule_id: nearMiss.matched_rule_id }
  }
  return { ok: false, reason: 'no_match' }
}
