// Bridges the dashboard_balance_facts() aggregate to the existing balance
// engine. Each (account, month) row becomes at most two synthetic
// transactions: the net of the 1st of the month (dated the 1st) and the net
// of the rest (dated the 2nd). accountBalanceAt() then behaves identically
// to replaying every raw row, because its two comparisons are both
// month-boundary based:
//   * `occurred_on <= monthEnd`  - whole months are in or out together,
//   * a snapshot anchor excludes `occurred_on <= anchor` where anchor is
//     always a YYYY-MM-01, i.e. exactly the 1st-of-month bucket.

import type { BalanceTx } from '@/lib/balances'

export type BalanceFact = {
  account_id: string
  /** YYYY-MM-01 (or a full date whose day is ignored). */
  month: string
  net_cents: number
  first_day_net_cents: number
}

/** Expand aggregate facts into synthetic transactions for accountBalanceAt. */
export function factsToBalanceTx(facts: BalanceFact[]): BalanceTx[] {
  const out: BalanceTx[] = []
  for (const f of facts) {
    const ym = f.month.slice(0, 7)
    if (f.first_day_net_cents !== 0) {
      out.push({ account_id: f.account_id, occurred_on: `${ym}-01`, amount_cents: f.first_day_net_cents })
    }
    const rest = f.net_cents - f.first_day_net_cents
    if (rest !== 0) {
      out.push({ account_id: f.account_id, occurred_on: `${ym}-02`, amount_cents: rest })
    }
  }
  return out
}

/**
 * Reference implementation of the SQL aggregate, used by the parity test to
 * prove facts + factsToBalanceTx() reproduces raw-transaction balances.
 */
export function factsFromTx(txs: BalanceTx[], upToExclusive: string): BalanceFact[] {
  const byKey = new Map<string, BalanceFact>()
  for (const t of txs) {
    if (t.occurred_on >= upToExclusive) continue
    const month = `${t.occurred_on.slice(0, 7)}-01`
    const key = `${t.account_id}|${month}`
    let f = byKey.get(key)
    if (!f) {
      f = { account_id: t.account_id, month, net_cents: 0, first_day_net_cents: 0 }
      byKey.set(key, f)
    }
    f.net_cents += t.amount_cents
    if (t.occurred_on.slice(8, 10) === '01') f.first_day_net_cents += t.amount_cents
  }
  return [...byKey.values()]
}
