// Deterministic, offline cleanup of cryptic bank/merchant descriptors into a
// human-friendly transaction title. Pure — safe to run at every ingest path
// (CSV/OFX import, email alerts) and in the UI.
//
// Conservative by design: when a descriptor is already a plausible name it is
// left alone; when nothing usable remains it returns null so the row surfaces
// in the "needs a title" triage queue rather than being given a junk title.

import { normalizeMerchant } from './statement-reconcile'

/**
 * Shared merchant key (upper-cased, digits + punctuation stripped). Re-exported
 * so alias lookups key merchants the same way the category index already does.
 * "TIM HORTONS #4821" and "Tim Hortons 0291" both collapse to "TIM HORTONS".
 */
export const merchantKey = normalizeMerchant

// High-confidence expansions for very common cryptic Canadian / NA descriptors.
// Small and unambiguous on purpose — a match short-circuits to the clean name.
const EXPANSIONS: Array<{ test: RegExp; name: string }> = [
  { test: /\bAMZN\b|\bAMAZON\s*MKTP\b|\bAMZNMKTP\b|\bAMAZON\.(?:CA|COM)\b/i, name: 'Amazon' },
  { test: /\bTIM\s*HORTONS?\b/i, name: 'Tim Hortons' },
  { test: /\bSTARBUCKS\b/i, name: 'Starbucks' },
  { test: /\bWAL[\s-]*MART\b|\bWALMART\b/i, name: 'Walmart' },
  { test: /\bMCDONALD'?S\b/i, name: "McDonald's" },
  { test: /\bUBER\s*EATS\b/i, name: 'Uber Eats' },
  { test: /\bUBER\b/i, name: 'Uber' },
  { test: /\bLYFT\b/i, name: 'Lyft' },
  { test: /\bNETFLIX\b/i, name: 'Netflix' },
  { test: /\bSPOTIFY\b/i, name: 'Spotify' },
  { test: /\bCANADIAN\s*TIRE\b/i, name: 'Canadian Tire' },
  { test: /\bSHOPPERS\s*DRUG(?:\s*MART)?\b/i, name: 'Shoppers Drug Mart' },
  // "LOBLAWS" only — "Loblaw" / "Loblaw City Market" is a different banner.
  { test: /\bLOBLAWS\b/i, name: 'Loblaws' },
  { test: /\bCOSTCO\b/i, name: 'Costco' },
  { test: /\bPRESTO\b/i, name: 'Presto' },
]

// Leading processor / POS verbiage to peel off the front of a descriptor.
const LEADING_NOISE: RegExp[] = [
  /^SQ\s*\*\s*/i, // Square: "SQ *COFFEE SHOP"
  /^TST\s*\*\s*/i, // Toast: "TST* RESTAURANT"
  /^(?:PY|PAYPAL)\s*\*\s*/i, // PayPal: "PYPL *MERCHANT"
  /^SP\s*\*\s*/i, // Shopify: "SP* MERCHANT" (require the * so real "SP …" names survive)
  /^POS\s+(?:PURCHASE|DEBIT)\s+/i,
  /^POS\s+/i,
  /^PURCHASE\s+/i,
  /^PRE[\s-]?AUTH(?:ORIZED|ORIZATION)?\s+(?:DEBIT\s+)?/i,
  /^(?:VISA|MASTERCARD|MC)\s+DEBIT\s+/i,
  /^INTERAC\s+(?:RETAIL\s+)?(?:PURCHASE|E[\s-]?TRANSFER)?\s*/i,
  /^DEBIT\s+(?:CARD\s+)?(?:PURCHASE\s+)?/i,
  /^WWW\.?\s*/i,
]

// Trailing store/terminal numbers, reference ids, country/province tails and
// dangling separators. Trimmed repeatedly since they stack ("…#4412 ON CA").
function stripTrailingNoise(s: string): string {
  let out = s
  for (let i = 0; i < 6; i++) {
    const before = out
    out = out
      .replace(/\s+#\s*\d+\s*$/i, '') // " #4412"
      .replace(/\s+\d{3,}\s*$/, '') // trailing long digit run "  0291"
      .replace(/\s+(?:CA|US|USA|CAN)\s*$/i, '') // country tail
      // Trailing Canadian province/territory code only — a generic 2-letter
      // strip would clip real words ("Gap US", "H&M").
      .replace(/\s+(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\s*$/, '')
      .replace(/[\s*#:/-]+$/, '') // dangling separators
      .trim()
    if (out === before) break
  }
  return out
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Turn a raw descriptor into a tidy title, or null when nothing usable remains.
 * Never throws.
 */
export function cleanTitle(raw: string | null | undefined): string | null {
  if (raw == null) return null
  let s = String(raw).replace(/\s+/g, ' ').trim()
  if (!s) return null

  // 1. A high-confidence brand match wins outright.
  for (const e of EXPANSIONS) if (e.test.test(s)) return e.name

  // 2. Peel stacked leading processor / POS prefixes.
  for (let i = 0; i < 4; i++) {
    let changed = false
    for (const re of LEADING_NOISE) {
      const next = s.replace(re, '')
      if (next !== s) {
        s = next.trim()
        changed = true
      }
    }
    if (!changed) break
  }

  // 3. Strip trailing store/terminal/ref noise + any url/phone leftovers.
  s = stripTrailingNoise(s)
  s = s
    .replace(/\bHTTPS?:\/\/\S+/gi, '')
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s) return null

  // 4. Re-check expansions after cleaning ("SQ *STARBUCKS 0291" → Starbucks).
  for (const e of EXPANSIONS) if (e.test.test(s)) return e.name

  // 5. What's left is basically a code (no real letters) → leave it untitled.
  if (s.replace(/[^A-Za-z]/g, '').length < 2) return null

  // 6. Normalise SHOUTING / lowercase descriptors to Title Case; leave an
  //    already mixed-case string alone (likely a real name).
  const isAllCaps = s === s.toUpperCase()
  const isAllLower = s === s.toLowerCase()
  return isAllCaps || isAllLower ? titleCase(s) : s
}

/**
 * Does this description still look like a raw/cryptic code the user would want
 * to retitle? Drives the "needs a title" triage queue. Errs toward NOT flagging
 * readable names so the queue stays meaningful.
 */
export function looksCryptic(desc: string | null | undefined): boolean {
  if (desc == null) return true
  const s = desc.trim()
  if (!s) return true
  // Obvious processor / POS / masked-card tokens (regardless of case).
  if (/(\bPOS\b|\bPURCHASE\b|\bPRE[\s-]?AUTH|\bSQ\s*\*|\bTST\s*\*|\bWWW\.|XXXX|\*{2,})/i.test(s)) {
    return true
  }
  // ALL-CAPS strings that also carry digits (e.g. "STARBUCKS #4412", "POS0291").
  // (A mixed-case "Apt #5 Rent" is intentionally NOT flagged.)
  if (s === s.toUpperCase() && /\d/.test(s) && /[A-Za-z]/.test(s)) return true
  return false
}
