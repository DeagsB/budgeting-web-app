// Pure compute for "who owes whom". Given transactions + their shares and
// any recorded settlements, produce a per-ordered-pair balance: how much
// `from_member_id` still owes `to_member_id` after netting settlements.
//
// Sign conventions:
// - transaction.amount_cents > 0 → the payer (transaction.member_id) paid out
//   of their account; non-payer shares OWE the payer.
// - transaction.amount_cents < 0 → refund landed on the payer's account;
//   non-payer shares are REFUNDED by the payer (share amount becomes a
//   credit from payer to owee, reducing whatever the owee owed earlier).
// - Shares where share.member_id == transaction.member_id are ignored (a
//   payer can't owe themselves).
// - Transactions with no payer (transaction.member_id == null) are ignored
//   - a shared-account transaction has no one to settle with.
//
// Settlements are straightforward: from_member paid to_member; subtract
// that from the running "from owes to" balance.
//
// Periods (see 20260826000006_settlement_periods.sql): every share and every
// settlement belongs to exactly one bucket - the period it was stamped with,
// or the open period. The open period's statement adds the carry-forward:
// whatever each closed period still nets to after its own settlements.

import { nextMonthStartISO } from './dates'

export type TxnLite = {
  id: string
  amount_cents: number
  member_id: string | null // the payer
}

export type ShareLite = {
  transaction_id: string
  member_id: string // the owee
  amount_cents: number // always positive; sign is inherited from the parent txn
}

export type SettlementLite = {
  from_member_id: string
  to_member_id: string
  amount_cents: number
}

export type PairBalance = {
  from_member_id: string
  to_member_id: string
  owed_cents: number // gross shares this direction (after refunds)
  settled_cents: number // settlements this direction
  net_cents: number // owed - settled
}

/**
 * Build a per-ordered-pair map. Keys are `${from}>${to}` to keep lookup simple.
 * Pairs with net_cents == 0 are included if there's any activity (either side).
 */
export function computePairBalances({
  transactions,
  shares,
  settlements,
}: {
  transactions: TxnLite[]
  shares: ShareLite[]
  settlements: SettlementLite[]
}): Map<string, PairBalance> {
  const txById = new Map<string, TxnLite>()
  for (const t of transactions) txById.set(t.id, t)

  const out = new Map<string, PairBalance>()
  const key = (from: string, to: string) => `${from}>${to}`
  const ensure = (from: string, to: string): PairBalance => {
    const k = key(from, to)
    let pair = out.get(k)
    if (!pair) {
      pair = {
        from_member_id: from,
        to_member_id: to,
        owed_cents: 0,
        settled_cents: 0,
        net_cents: 0,
      }
      out.set(k, pair)
    }
    return pair
  }

  for (const s of shares) {
    const tx = txById.get(s.transaction_id)
    if (!tx || !tx.member_id) continue
    if (s.member_id === tx.member_id) continue // payer's own share, no debt
    // Positive txn: owee owes payer s.amount_cents.
    // Negative txn (refund): owee is refunded s.amount_cents (payer credits owee).
    const direction = Math.sign(tx.amount_cents) || 0
    if (direction === 0) continue
    if (direction > 0) {
      const pair = ensure(s.member_id, tx.member_id) // owee → payer
      pair.owed_cents += s.amount_cents
    } else {
      const pair = ensure(s.member_id, tx.member_id)
      pair.owed_cents -= s.amount_cents // reduces what owee owes payer
    }
  }

  for (const st of settlements) {
    const pair = ensure(st.from_member_id, st.to_member_id)
    pair.settled_cents += st.amount_cents
  }

  for (const pair of out.values()) {
    pair.net_cents = pair.owed_cents - pair.settled_cents
  }

  return out
}

/**
 * Given per-ordered-pair balances, net them into unique directional balances
 * so each unordered pair appears once. Positive net_cents means A owes B;
 * negative means B owes A (we swap the direction to keep positive). Returns
 * only pairs with |net| > 0.
 */
export type NetBalance = {
  from_member_id: string // the one who owes (after netting)
  to_member_id: string
  net_cents: number // always > 0 after netting
}

export function netUnorderedPairs(pairs: Map<string, PairBalance>): NetBalance[] {
  const seen = new Set<string>()
  const result: NetBalance[] = []

  for (const pair of pairs.values()) {
    const { from_member_id: a, to_member_id: b } = pair
    const unordered = [a, b].sort().join('|')
    if (seen.has(unordered)) continue
    seen.add(unordered)

    const ab = pair.net_cents
    const reverse = pairs.get(`${b}>${a}`)
    const ba = reverse?.net_cents ?? 0

    const net = ab - ba
    if (net === 0) continue
    if (net > 0) result.push({ from_member_id: a, to_member_id: b, net_cents: net })
    else result.push({ from_member_id: b, to_member_id: a, net_cents: -net })
  }

  return result
}

/**
 * Totals per transaction: how much of the transaction is currently shared
 * (sum of share amounts on this transaction). Useful for the /shared page
 * to show "flagged N transactions, $X total shared".
 */
export function totalSharedByTransaction(shares: ShareLite[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of shares) m.set(s.transaction_id, (m.get(s.transaction_id) ?? 0) + s.amount_cents)
  return m
}

// ─── Periods ───────────────────────────────────────────────────────────────

export type PeriodStatus = 'open' | 'closed' | 'settled'

export type PeriodLite = {
  id: string
  period_start: string // YYYY-MM-DD
  period_end: string | null // null while open
  status: PeriodStatus
}

export type ShareWithPeriod = ShareLite & { settlement_period_id: string | null }
export type SettlementWithPeriod = SettlementLite & { period_id: string | null; settled_on: string }

/** Bucket for a share: its stamp, else the open period. */
export function shareBucket(s: ShareWithPeriod, openId: string): string {
  return s.settlement_period_id ?? openId
}

/**
 * Bucket for a settlement: its period, else (legacy rows) the closed period
 * whose date range contains settled_on, else the open period.
 */
export function settlementBucket(st: SettlementWithPeriod, periods: PeriodLite[], openId: string): string {
  if (st.period_id) return st.period_id
  for (const p of periods) {
    if (p.status === 'open' || !p.period_end) continue
    if (st.settled_on >= p.period_start && st.settled_on <= p.period_end) return p.id
  }
  return openId
}

/** One pass over all rows → per-period pair balances. */
export function computeBalancesByPeriod(input: {
  periods: PeriodLite[]
  transactions: TxnLite[]
  shares: ShareWithPeriod[]
  settlements: SettlementWithPeriod[]
}): Map<string, Map<string, PairBalance>> {
  const open = input.periods.find((p) => p.status === 'open')
  const openId = open?.id ?? '__open__'
  const sharesBy = new Map<string, ShareWithPeriod[]>()
  const settsBy = new Map<string, SettlementWithPeriod[]>()
  for (const s of input.shares) {
    const k = shareBucket(s, openId)
    ;(sharesBy.get(k) ?? sharesBy.set(k, []).get(k)!).push(s)
  }
  for (const st of input.settlements) {
    const k = settlementBucket(st, input.periods, openId)
    ;(settsBy.get(k) ?? settsBy.set(k, []).get(k)!).push(st)
  }
  const out = new Map<string, Map<string, PairBalance>>()
  const ids = new Set<string>([...input.periods.map((p) => p.id), ...sharesBy.keys(), ...settsBy.keys()])
  for (const id of ids) {
    out.set(
      id,
      computePairBalances({
        transactions: input.transactions,
        shares: sharesBy.get(id) ?? [],
        settlements: settsBy.get(id) ?? [],
      }),
    )
  }
  return out
}

export type PeriodStatement = {
  period: PeriodLite
  /** Net lines for this period. For the open period this INCLUDES carry-forward. */
  lines: NetBalance[]
  /** Only for the open period: what closed periods still net to. */
  carryForward: NetBalance[]
  totalOwedCents: number
  totalSettledCents: number
  totalNetCents: number
}

function mergePairs(into: Map<string, PairBalance>, from: Map<string, PairBalance>): void {
  for (const [k, p] of from) {
    const cur = into.get(k)
    if (cur) {
      cur.owed_cents += p.owed_cents
      cur.settled_cents += p.settled_cents
      cur.net_cents = cur.owed_cents - cur.settled_cents
    } else {
      into.set(k, { ...p })
    }
  }
}

/**
 * Statement for one period. Closed/settled periods show their own live net
 * (edits after close still count, and flow into the open period's
 * carry-forward). The open period shows its own shares plus everything closed
 * periods still owe after their settlements, so nothing is ever lost.
 */
export function computePeriodStatement(
  periodId: string,
  byPeriod: Map<string, Map<string, PairBalance>>,
  periods: PeriodLite[],
): PeriodStatement {
  const period = periods.find((p) => p.id === periodId)
  if (!period) throw new Error(`Unknown period ${periodId}`)
  const own = byPeriod.get(periodId) ?? new Map<string, PairBalance>()

  let carryForward: NetBalance[] = []
  let merged = own
  if (period.status === 'open') {
    const carry = new Map<string, PairBalance>()
    for (const p of periods) {
      if (p.id === periodId || p.status === 'open') continue
      mergePairs(carry, byPeriod.get(p.id) ?? new Map())
    }
    carryForward = netUnorderedPairs(carry)
    merged = new Map<string, PairBalance>()
    mergePairs(merged, own)
    mergePairs(merged, carry)
  }

  const lines = netUnorderedPairs(merged)
  const totalOwedCents = Array.from(own.values()).reduce((s, p) => s + Math.max(0, p.owed_cents), 0)
  const totalSettledCents = Array.from(own.values()).reduce((s, p) => s + p.settled_cents, 0)
  const totalNetCents = lines.reduce((s, l) => s + l.net_cents, 0)
  return { period, lines, carryForward, totalOwedCents, totalSettledCents, totalNetCents }
}

// ─── Close-day math (cron) ─────────────────────────────────────────────────

/** The auto-close date for the month containing `todayISO`. closeDay is 1..28. */
export function closeDateForMonth(todayISO: string, closeDay: number): string {
  const day = Math.min(28, Math.max(1, Math.floor(closeDay)))
  return `${todayISO.slice(0, 7)}-${String(day).padStart(2, '0')}`
}

/**
 * Close automatically when today is on/after the month's close date and no
 * period was already closed this calendar month (a manual "close now" earlier
 * in the month counts). Idempotent across repeated cron runs.
 */
export function shouldAutoClose(args: { todayISO: string; closeDay: number; lastClosedAtISO: string | null }): boolean {
  const closeDate = closeDateForMonth(args.todayISO, args.closeDay)
  if (args.todayISO < closeDate) return false
  if (args.lastClosedAtISO && args.lastClosedAtISO.slice(0, 7) === args.todayISO.slice(0, 7)) return false
  return true
}

export function nextAutoCloseDate(todayISO: string, closeDay: number, lastClosedAtISO: string | null): string {
  if (shouldAutoClose({ todayISO, closeDay, lastClosedAtISO })) return closeDateForMonth(todayISO, closeDay)
  const thisMonth = closeDateForMonth(todayISO, closeDay)
  if (todayISO < thisMonth && !(lastClosedAtISO && lastClosedAtISO.slice(0, 7) === todayISO.slice(0, 7))) return thisMonth
  return closeDateForMonth(nextMonthStartISO(todayISO), closeDay)
}
