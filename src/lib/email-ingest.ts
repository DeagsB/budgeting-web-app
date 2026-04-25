// Pure functions for parsing a forwarded bank-alert email against a set of
// per-household regex rules. No I/O — the route handler does the DB work.

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
  default_account_id: string | null
  default_member_id: string | null
  default_category_id: string | null
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
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
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

export function parseEmail(rules: IngestRule[], email: IngestEmail): ParseOutcome {
  const enabledRules = rules.filter((r) => r.enabled)
  const candidates = enabledRules.filter((r) => ruleMatches(r, email))
  if (candidates.length === 0) return { ok: false, reason: 'no_match' }

  for (const rule of candidates) {
    const amountRe = safeRegex(rule.amount_regex)
    if (!amountRe) continue
    const amountMatch = email.body.match(amountRe)
    if (!amountMatch) continue
    const captured = amountMatch[1] ?? amountMatch[0]
    const absCents = parseAmountCents(captured)
    if (absCents === null) {
      return { ok: false, reason: 'parse_error', detail: 'Amount capture did not parse.', matched_rule_id: rule.id }
    }

    let description: string | null = null
    if (rule.description_regex) {
      const re = safeRegex(rule.description_regex)
      const m = re ? email.body.match(re) : null
      description = m ? (m[1] ?? m[0]).trim() : null
    }
    if (!description) description = email.subject || null

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

    return {
      ok: true,
      tx: {
        occurred_on: occurredOn,
        amount_cents: signedCents,
        description,
        account_id: rule.default_account_id,
        member_id: rule.default_member_id,
        category_id: rule.default_category_id,
        external_id: email.message_id,
        matched_rule_id: rule.id,
      },
    }
  }

  return { ok: false, reason: 'no_match' }
}
