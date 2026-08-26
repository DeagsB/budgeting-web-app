// Cashflow-derived account balances + net-worth trail. The balance of an
// account at a point in time is its opening balance plus the net effect of
// every transaction up to that month — so the figures move with actual
// spending and income instead of sitting flat until someone records a manual
// snapshot. A balance snapshot, when present, anchors the running balance and
// only transactions after it are applied on top.
//
// Money convention (matches the schema): amount_cents is signed, positive =
// outflow (money leaving the account); negative = inflow. On an asset account
// an outflow lowers the balance (effect `-amount_cents`). On a liability
// account balances are the amount owing, so an outflow (a purchase on the
// card) raises it (effect `+amount_cents`).

import { LIABILITY_TYPES, type AccountType } from '@/lib/domain'

export type BalanceAccount = {
  id: string
  type: AccountType
  opening_balance_cents: number
}

export type BalanceTx = {
  account_id: string
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
}

export type BalanceSnapshot = {
  account_id: string
  as_of_month: string // YYYY-MM-01
  balance_cents: number
}

// Last calendar day of the month that `monthISO` (a YYYY-MM-01) falls in.
function endOfMonthISO(monthISO: string): string {
  const y = Number(monthISO.slice(0, 4))
  const mo = Number(monthISO.slice(5, 7))
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  return `${monthISO.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`
}

/** Transactions grouped by account, each list sorted ascending by date. */
export function groupTxByAccount(txs: BalanceTx[]): Map<string, BalanceTx[]> {
  const m = new Map<string, BalanceTx[]>()
  for (const t of txs) {
    const list = m.get(t.account_id)
    if (list) list.push(t)
    else m.set(t.account_id, [t])
  }
  for (const list of m.values()) list.sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : a.occurred_on > b.occurred_on ? 1 : 0))
  return m
}

/** Snapshots grouped by account, each list sorted ascending by month. */
export function groupSnapsByAccount(snaps: BalanceSnapshot[]): Map<string, BalanceSnapshot[]> {
  const m = new Map<string, BalanceSnapshot[]>()
  for (const s of snaps) {
    const list = m.get(s.account_id)
    if (list) list.push(s)
    else m.set(s.account_id, [s])
  }
  for (const list of m.values()) list.sort((a, b) => (a.as_of_month < b.as_of_month ? -1 : a.as_of_month > b.as_of_month ? 1 : 0))
  return m
}

/**
 * Running balance of one account through the end of `monthISO`.
 * Starts from the latest snapshot at/before the month (or the opening balance)
 * and applies every transaction up to the month end that isn't already baked
 * into that anchor.
 */
export function accountBalanceAt(
  account: BalanceAccount,
  monthISO: string,
  txByAccount: Map<string, BalanceTx[]>,
  snapsByAccount: Map<string, BalanceSnapshot[]>,
): number {
  const monthEnd = endOfMonthISO(monthISO)

  let base = account.opening_balance_cents
  let afterExclusive: string | null = null
  const snaps = snapsByAccount.get(account.id)
  if (snaps && snaps.length) {
    let anchor: BalanceSnapshot | null = null
    for (const s of snaps) {
      if (s.as_of_month <= monthEnd) anchor = s
      else break
    }
    if (anchor) {
      base = anchor.balance_cents
      afterExclusive = anchor.as_of_month
    }
  }

  // Asset accounts hold what you have: an outflow lowers the balance.
  // Liability accounts hold what you owe (positive = owing, matching the
  // "enter the balance owing as a positive number" rule on the add form and
  // Plaid's reporting): a purchase (outflow) raises what you owe, a payment
  // (inflow) lowers it. Same signed amount, opposite effect.
  const effect = LIABILITY_TYPES.has(account.type) ? 1 : -1
  let delta = 0
  for (const tx of txByAccount.get(account.id) ?? []) {
    if (tx.occurred_on > monthEnd) break // list is sorted ascending
    if (afterExclusive && tx.occurred_on <= afterExclusive) continue
    delta += effect * tx.amount_cents
  }
  return base + delta
}

/** Household net worth (assets − liabilities) through the end of `monthISO`. */
export function netWorthAt(
  accounts: BalanceAccount[],
  monthISO: string,
  txByAccount: Map<string, BalanceTx[]>,
  snapsByAccount: Map<string, BalanceSnapshot[]>,
): number {
  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    const bal = accountBalanceAt(a, monthISO, txByAccount, snapsByAccount)
    if (LIABILITY_TYPES.has(a.type)) liabilities += bal
    else assets += bal
  }
  return assets - liabilities
}

/** Net-worth value for each of the given months (a trail for charting). */
export function netWorthTrail(
  accounts: BalanceAccount[],
  months: string[],
  txByAccount: Map<string, BalanceTx[]>,
  snapsByAccount: Map<string, BalanceSnapshot[]>,
): { month: string; value: number }[] {
  return months.map((m) => ({ month: m, value: netWorthAt(accounts, m, txByAccount, snapsByAccount) }))
}
