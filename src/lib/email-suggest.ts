// Heuristic rule generator: takes a pasted bank-alert email and returns
// regex suggestions to seed a bank_email_rules row. Pure functions - no LLM,
// no I/O. Calibrated against the Canadian big-six alert formats (RBC, TD,
// BMO, CIBC, Scotia, National). Suggestions are *starting points* - the user
// can still tweak in the form.

export type SampleEmail = {
  from: string
  subject: string
  body: string
}

export type SuggestedRule = {
  match_from: string | null
  match_subject: string | null
  amount_regex: string
  description_regex: string | null
  direction: 'outflow' | 'inflow' | 'auto'
  inflow_regex: string | null
  // Captures group 1 from the body - the engine looks it up against
  // accounts.last_four to route automatically.
  account_router_regex: string | null
  notes: string[]
}

const INFLOW_KEYWORDS =
  /(deposit|credit|received|refund|incoming|payment received|e[-\s]?transfer received|interac e[-\s]?transfer received|reversed|reversal)/i

const OUTFLOW_KEYWORDS =
  /(purchase|withdrawal|debit|payment sent|outgoing|spent|sent|charged|transaction)/i

const DOLLAR_PATTERN = /\$\s?([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})/
const PLAIN_AMOUNT_PATTERN = /\b([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2}|[0-9]+\.[0-9]{2})\s?(?:CAD|USD|cents)?\b/

// Merchant labels seen in real Canadian bank alerts. Order matters - we want
// the most specific match first so we don't capture trailing punctuation.
const MERCHANT_PHRASES: Array<{ pattern: RegExp; regexSource: string }> = [
  // "at MERCHANT NAME on …" / "at MERCHANT NAME."
  { pattern: /\bat\s+([A-Z0-9][A-Z0-9 .&'\-/#]{1,80}?)(?=\s+(?:on|using|with|for|\.))/, regexSource: "at\\s+([A-Z0-9][A-Z0-9 .&'\\-/#]{1,80}?)(?=\\s+(?:on|using|with|for|\\.))" },
  { pattern: /\bat\s+([A-Z0-9][A-Z0-9 .&'\-/#]{2,80})/, regexSource: "at\\s+([A-Z0-9][A-Z0-9 .&'\\-/#]{2,80})" },
  // "from MERCHANT" - common in deposit/transfer alerts
  { pattern: /\bfrom\s+([A-Z0-9][A-Z0-9 .&'\-/#]{2,80})/, regexSource: "from\\s+([A-Z0-9][A-Z0-9 .&'\\-/#]{2,80})" },
  // "to MERCHANT" - bill payments
  { pattern: /\bto\s+([A-Z0-9][A-Z0-9 .&'\-/#]{2,80})/, regexSource: "to\\s+([A-Z0-9][A-Z0-9 .&'\\-/#]{2,80})" },
  // Labelled: "Merchant: X" or "Payee: X"
  { pattern: /\b(?:merchant|payee|description)\s*:\s*([^\r\n]{2,80})/i, regexSource: "(?:merchant|payee|description)\\s*:\\s*([^\\r\\n]{2,80})" },
]

const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g
function escapeRegex(s: string): string {
  return s.replace(ESCAPE_RE, '\\$&')
}

// Pulls "alerts@bank.com" out of "Bank Alerts <alerts@bank.com>" or returns
// the input as-is if it's already an address.
function extractEmailAddress(raw: string): string | null {
  const angle = raw.match(/<([^>]+@[^>]+)>/)
  if (angle) return angle[1].trim()
  const bare = raw.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
  return bare ? bare[1].trim() : null
}

function buildFromRegex(rawFrom: string): string | null {
  const addr = extractEmailAddress(rawFrom)
  if (!addr) return null
  // Match the full address, escaped - strict but predictable. Users can relax
  // it to a domain match in the form if needed.
  return escapeRegex(addr)
}

function buildSubjectRegex(subject: string): string | null {
  // Only suggest a subject regex when we recognise distinctive transaction
  // keywords. Otherwise leave it null so the rule isn't accidentally narrow.
  const found: string[] = []
  if (/\b(transaction|notification|alert)\b/i.test(subject)) found.push('transaction|notification|alert')
  if (/\b(purchase|withdrawal|debit|payment|deposit|credit|received|transfer)\b/i.test(subject)) {
    found.push('purchase|withdrawal|debit|payment|deposit|credit|received|transfer')
  }
  if (found.length === 0) return null
  return `(${found.join('|')})`
}

function buildAmountRegex(body: string): { regex: string; sample: string | null } {
  const dollar = body.match(DOLLAR_PATTERN)
  if (dollar) return { regex: '\\$([0-9,]+\\.[0-9]{2})', sample: dollar[1] }
  const plain = body.match(PLAIN_AMOUNT_PATTERN)
  if (plain) return { regex: '([0-9,]+\\.[0-9]{2})', sample: plain[1] }
  // Last-resort default; user will need to tweak.
  return { regex: '\\$([0-9,]+\\.[0-9]{2})', sample: null }
}

function buildDescriptionRegex(body: string): { regex: string; sample: string | null } | null {
  for (const phrase of MERCHANT_PHRASES) {
    const m = body.match(phrase.pattern)
    if (m && m[1]) {
      return { regex: phrase.regexSource, sample: m[1].trim().replace(/[.,\s]+$/, '') }
    }
  }
  return null
}

function guessDirection(sample: SampleEmail): {
  direction: SuggestedRule['direction']
  inflow_regex: string | null
} {
  const haystack = `${sample.subject}\n${sample.body}`
  const isInflow = INFLOW_KEYWORDS.test(haystack)
  const isOutflow = OUTFLOW_KEYWORDS.test(haystack)
  if (isInflow && !isOutflow) {
    return { direction: 'inflow', inflow_regex: null }
  }
  if (isOutflow && !isInflow) {
    return { direction: 'outflow', inflow_regex: null }
  }
  // Mixed signal or ambiguous → use auto-mode with an inflow regex so the
  // engine flips signs when it sees a deposit/credit.
  return {
    direction: 'auto',
    inflow_regex: '(deposit|credit|received|refund|e[-\\s]?transfer received|reversed|reversal)',
  }
}

// Universal Canadian-bank "ending in NNNN" / French "se terminant par NNNN".
// Capture group 1 is the last 4 digits.
const ROUTER_DETECT = /\bending\s+(?:in|with)\s+(\d{4})\b|\bse\s+terminant\s+par\s+(\d{4})\b/i
const ROUTER_REGEX = 'ending\\s+(?:in|with)\\s+(\\d{4})|se terminant par\\s+(\\d{4})'

export function suggestRule(sample: SampleEmail): SuggestedRule {
  const notes: string[] = []
  const match_from = buildFromRegex(sample.from)
  if (!match_from) notes.push('Could not extract sender address from “From” - leaving blank.')

  const match_subject = buildSubjectRegex(sample.subject)
  if (!match_subject) notes.push('Subject was generic - left blank to match all subjects from this sender.')

  const amount = buildAmountRegex(sample.body)
  if (!amount.sample) notes.push('No dollar amount detected in the body - using the default $X.XX pattern. Verify it matches a real alert.')
  else notes.push(`Detected amount: $${amount.sample}.`)

  const description = buildDescriptionRegex(sample.body)
  if (!description) notes.push('No merchant phrase detected - description will fall back to the email subject.')
  else notes.push(`Detected merchant: “${description.sample}”.`)

  const dir = guessDirection(sample)
  if (dir.direction === 'auto') notes.push('Direction was ambiguous - using auto-mode with an inflow keyword regex.')
  else notes.push(`Direction: ${dir.direction}.`)

  const routerMatch = sample.body.match(ROUTER_DETECT)
  const last4 = routerMatch ? (routerMatch[1] || routerMatch[2]) : null
  const account_router_regex = last4 ? ROUTER_REGEX : null
  if (last4) {
    notes.push(`Detected account discriminator: ····${last4}. Auto-routing wired up - set the same last-4 on the matching account in Accounts.`)
  } else {
    notes.push('No “ending in NNNN” pattern in the body - auto-routing left off; everything will land in the fallback account.')
  }

  return {
    match_from,
    match_subject,
    amount_regex: amount.regex,
    description_regex: description?.regex ?? null,
    direction: dir.direction,
    inflow_regex: dir.inflow_regex,
    account_router_regex,
    notes,
  }
}
