// Pure logic for reconciling a freshly-staged statement import (CSV/OFX)
// against transactions that already exist in the household — chiefly the
// near-real-time rows created by the email-alert pipeline. No I/O; the server
// action does the DB work and feeds these functions.
//
// Money convention (matches the schema): amount_cents is signed, positive =
// outflow. Both the staged rows and existing rows use the same convention, so
// an exact amount_cents equality is a valid match key.

export type ExistingTx = {
  id: string
  account_id: string
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
  description: string | null
  source: string // 'manual' | 'csv_import' | 'ofx_import' | 'email_alert'
}

export type ReconcileRow = {
  account_id: string
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
}

export type RowMatch = {
  matchedTxId: string | null
  matchedSource: string | null
  matchedDate: string | null
  matchedDescription: string | null
}

const DEFAULT_TOLERANCE_DAYS = 5

function toDayNumber(iso: string): number {
  // Parse a YYYY-MM-DD into a UTC day index. Returns NaN on malformed input.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return NaN
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

function dayDiff(a: string, b: string): number {
  return Math.abs(toDayNumber(a) - toDayNumber(b))
}

// Alerts are the rows we most want to upgrade with a statement's cleaner
// merchant name, so they sort ahead of other sources when several candidates
// tie on date distance.
function sourceRank(source: string): number {
  return source === 'email_alert' ? 0 : 1
}

/**
 * Match each staged row to at most one existing transaction in the same
 * account, with the same signed amount, whose date is within `toleranceDays`
 * (a swipe-time alert and the statement's posting date differ by a few days).
 * Greedy: each existing transaction is claimed by at most one staged row, so
 * two identical $4.20 coffees can't both collapse onto a single alert.
 */
export function reconcileRows(
  rows: ReconcileRow[],
  existing: ExistingTx[],
  opts: { toleranceDays?: number } = {},
): RowMatch[] {
  const tol = opts.toleranceDays ?? DEFAULT_TOLERANCE_DAYS
  const used = new Set<string>()

  const byAccount = new Map<string, ExistingTx[]>()
  for (const e of existing) {
    const list = byAccount.get(e.account_id)
    if (list) list.push(e)
    else byAccount.set(e.account_id, [e])
  }

  return rows.map((row) => {
    const candidates = (byAccount.get(row.account_id) ?? [])
      .filter(
        (e) =>
          !used.has(e.id) &&
          e.amount_cents === row.amount_cents &&
          dayDiff(e.occurred_on, row.occurred_on) <= tol,
      )
      .sort(
        (a, b) =>
          dayDiff(a.occurred_on, row.occurred_on) - dayDiff(b.occurred_on, row.occurred_on) ||
          sourceRank(a.source) - sourceRank(b.source),
      )

    const match = candidates[0]
    if (!match) {
      return { matchedTxId: null, matchedSource: null, matchedDate: null, matchedDescription: null }
    }
    used.add(match.id)
    return {
      matchedTxId: match.id,
      matchedSource: match.source,
      matchedDate: match.occurred_on,
      matchedDescription: match.description,
    }
  })
}

// ─── Category suggestion (history-based) ──────────────────────────────────

export type HistoryEntry = {
  description: string | null
  category_id: string | null
}

/**
 * Collapse a raw description to a stable merchant key: upper-case, drop digits
 * (store / terminal numbers) and punctuation, squeeze whitespace. "TIM
 * HORTONS #4821" and "Tim Hortons 0291" both become "TIM HORTONS".
 */
export function normalizeMerchant(desc: string | null | undefined): string {
  if (!desc) return ''
  return desc
    .toUpperCase()
    .replace(/[0-9]+/g, ' ')
    .replace(/[^A-Z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Build a merchant-key → most-frequently-used category lookup from history.
 * Only categorised rows contribute. Ties resolve to the higher count, then
 * deterministically by category id so the result is stable.
 */
export function buildCategoryIndex(history: HistoryEntry[]): Map<string, string> {
  const tally = new Map<string, Map<string, number>>()
  for (const h of history) {
    if (!h.category_id) continue
    const key = normalizeMerchant(h.description)
    if (!key) continue
    let counts = tally.get(key)
    if (!counts) {
      counts = new Map()
      tally.set(key, counts)
    }
    counts.set(h.category_id, (counts.get(h.category_id) ?? 0) + 1)
  }

  const index = new Map<string, string>()
  for (const [key, counts] of tally) {
    let bestId: string | null = null
    let bestCount = -1
    for (const [catId, count] of counts) {
      if (count > bestCount || (count === bestCount && bestId !== null && catId < bestId)) {
        bestCount = count
        bestId = catId
      }
    }
    if (bestId) index.set(key, bestId)
  }
  return index
}

/**
 * Suggest a category for a description from the prebuilt index. Exact merchant
 * key first; otherwise the longest indexed key that is a token-boundary prefix
 * of this merchant (so "TIM HORTONS EXPRESS" still resolves via "TIM HORTONS").
 */
export function suggestCategory(
  description: string | null | undefined,
  index: Map<string, string>,
): string | null {
  const key = normalizeMerchant(description)
  if (!key) return null
  const exact = index.get(key)
  if (exact) return exact

  let best: string | null = null
  let bestLen = 0
  for (const [indexedKey, catId] of index) {
    if (indexedKey.length > bestLen && (key === indexedKey || key.startsWith(indexedKey + ' '))) {
      best = catId
      bestLen = indexedKey.length
    }
  }
  return best
}
