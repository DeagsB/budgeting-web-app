// One-click rule definitions for the Canadian big-six banks. Each preset
// captures the regexes we've calibrated against real alert formats so the
// user only needs to:
//   1. Pick their bank → click "Add" (creates the rule)
//   2. Set last_four on each of their accounts (so the router knows where
//      "ending in 1234" lands)
//
// Rules use a permissive `match_from` (covers both alerts@ and noreply@
// senders most banks use), a forgiving amount regex, and the universal
// "ending in NNNN" router pattern that every Canadian bank embeds in
// transaction alerts. Direction is `auto` so deposits flip sign correctly.

export type BankPreset = {
  /** Stable id for the preset; not stored in DB. */
  id: string
  /** Display name in the UI. */
  label: string
  /** Short bank-specific note shown next to the chip. */
  hint: string
  /** Pre-filled values for a `bank_email_rules` row. */
  rule: {
    name: string
    enabled: boolean
    match_from: string
    match_subject: string | null
    amount_regex: string
    description_regex: string | null
    date_regex: string | null
    direction: 'outflow' | 'inflow' | 'auto'
    inflow_regex: string | null
    account_router_regex: string
  }
}

// The "ending in NNNN" router is universal across the big-six. The variants:
//   RBC:   "ending in 1234"
//   TD:    "ending in 1234"
//   BMO:   "ending with 1234" / "ending in 1234"
//   CIBC:  "ending in 1234"
//   Scotia:"ending in 1234"
//   NBC:   "ending in 1234" / "se terminant par 1234"
const UNIVERSAL_ROUTER =
  'ending\\s+(?:in|with)\\s+(\\d{4})|se terminant par\\s+(\\d{4})'

const UNIVERSAL_AMOUNT = '\\$([0-9,]+\\.[0-9]{2})'
const UNIVERSAL_DESCRIPTION = "at\\s+([A-Z0-9][A-Z0-9 .&'\\-/#]{1,80}?)(?=\\s+(?:on|using|with|for|\\.))"
const UNIVERSAL_INFLOW =
  '(deposit|credit|received|refund|incoming|reversal|interac e[-\\s]?transfer received)'

export const BANK_PRESETS: BankPreset[] = [
  {
    id: 'rbc',
    label: 'RBC',
    hint: 'Royal Bank — chequing, savings, Visa, Mastercard',
    rule: {
      name: 'RBC alerts',
      enabled: true,
      match_from: '(donotreply|alerts|notification)@(rbc|royalbank)\\.com',
      match_subject: '(transaction|purchase|withdrawal|deposit|credit card|debit|notification|alert)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW,
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
  {
    id: 'td',
    label: 'TD',
    hint: 'TD Canada Trust — EasyWeb alerts',
    rule: {
      name: 'TD EasyWeb alerts',
      enabled: true,
      match_from: '(easyweb|alerts|noreply)@td\\.com',
      match_subject: '(purchase|withdrawal|deposit|transaction|alert)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW,
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
  {
    id: 'bmo',
    label: 'BMO',
    hint: 'Bank of Montreal — accounts + Mastercards',
    rule: {
      name: 'BMO alerts',
      enabled: true,
      match_from: '(alerts|noreply|notifications)@bmo\\.com',
      match_subject: '(transaction|purchase|withdrawal|deposit|alert|notification)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW,
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
  {
    id: 'cibc',
    label: 'CIBC',
    hint: 'CIBC — accounts + Visas',
    rule: {
      name: 'CIBC alerts',
      enabled: true,
      match_from: '(alerts|notification|noreply)@cibc\\.com',
      match_subject: '(transaction|purchase|withdrawal|deposit|alert|notification)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW,
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
  {
    id: 'scotia',
    label: 'Scotiabank',
    hint: 'Scotiabank — accounts + cards',
    rule: {
      name: 'Scotiabank alerts',
      enabled: true,
      match_from: '(alerts|noreply|notification)@scotiabank\\.com',
      match_subject: '(transaction|purchase|withdrawal|deposit|alert|notification)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW,
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
  {
    id: 'nbc',
    label: 'National Bank',
    hint: 'NBC — bilingual alerts (en/fr)',
    rule: {
      name: 'National Bank alerts',
      enabled: true,
      match_from: '(alerts|noreply|notifications)@(nbc|bnc)\\.ca',
      match_subject: '(transaction|purchase|withdrawal|deposit|alert|notification|opération|achat|retrait|dépôt)',
      amount_regex: UNIVERSAL_AMOUNT,
      description_regex: UNIVERSAL_DESCRIPTION,
      date_regex: null,
      direction: 'auto',
      inflow_regex: UNIVERSAL_INFLOW + '|(dépôt|crédit|reçu)',
      account_router_regex: UNIVERSAL_ROUTER,
    },
  },
]
