// Plaid balances -> account_balance_snapshots rows.
//
// Why this exists: Plaid-linked accounts are created with opening_balance_cents
// = 0 and every synced purchase then LOWERS the derived balance, so a savings
// account with $17,550 of outflows showed as -$17,550 on the balance sheet.
// Plaid tells us the real balance on every /transactions/sync response and on
// /accounts/balance/get; this module turns that into a snapshot the existing
// balance engine (src/lib/balances.ts) understands.
//
// ─── Snapshot semantics (read accountBalanceAt before touching this) ────────
//
// A snapshot row (account_id, as_of_month = YYYY-MM-01, balance_cents) is the
// anchor for every month >= as_of_month. When it anchors, the engine SKIPS all
// transactions with occurred_on <= as_of_month (the first of that month) and
// applies every later transaction on top, through the end of the month being
// viewed. So a snapshot dated YYYY-MM-01 means:
//
//     "the balance after everything dated on or before the 1st of that month"
//
// i.e. effectively a START-of-month balance, not the month-end figure the
// migration comment loosely describes. A Plaid balance is "right now", mid
// month, so writing it verbatim against the current month would double-count
// every transaction dated between the 2nd and today (they are already inside
// Plaid's number AND the engine would add them again).
//
// The exact fix is to roll Plaid's current balance BACK to the 1st of the
// current month by undoing this month's transactions we hold:
//
//     snapshot = current + sum(amount_cents)  for tx with
//                1st-of-month < occurred_on <= today
//
// (amount_cents is positive = outflow, and the engine applies -amount_cents,
// so adding amount_cents back reverses it). Transactions dated after today
// (rare, e.g. a scheduled payment) are not in Plaid's figure yet and the engine
// keeps applying them on top, which is the right thing. The engine then derives
// exactly Plaid's current balance for "today" and stays exact as newer
// transactions arrive until the next sync writes a fresher snapshot.
//
// Pending rows are included in the roll-back: every row the engine will apply
// must be reversed, otherwise the derived figure would be off by the pending
// amounts. The derived balance therefore equals Plaid `current` (posted only),
// which matches the "current balance" a bank app shows.
//
// Sign convention: Plaid reports liabilities (credit / loan) as a POSITIVE
// amount owed, which is exactly how Maple stores liability balances (see
// accounts/row.tsx: it negates for display only; balance-sheet subtracts the
// liability total). So there is no sign flip for any account type: cents =
// round(current * 100). Ties are broken by Math.round like plaidAmountToCents.

import { LIABILITY_TYPES, type AccountType } from '@/lib/domain'

export type PlaidBalanceAccount = {
  plaidAccountId: string
  localAccountId: string
  type: AccountType
  balances: { current: number | null; available: number | null }
}

export type MonthTx = {
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
}

export type SnapshotRow = {
  account_id: string
  as_of_month: string // YYYY-MM-01
  balance_cents: number
}

/** `YYYY-MM-01` for the month that `todayISO` (a YYYY-MM-DD) falls in. */
export function monthOfISO(todayISO: string): string {
  return `${todayISO.slice(0, 7)}-01`
}

/** Plaid decimal balance → cents, matching plaidAmountToCents rounding. */
export function plaidBalanceToCents(balance: number): number {
  if (!Number.isFinite(balance)) throw new Error(`Non-finite Plaid balance: ${balance}`)
  return Math.round(balance * 100)
}

/**
 * Roll each account's Plaid `current` balance back to the first of the current
 * month (see the header comment) and return one snapshot row per account.
 *
 * - Accounts whose `current` is null are skipped: `available` is a different
 *   number (net of pending, or cash-only for investments) and anchoring on it
 *   would silently mis-state the balance sheet.
 * - `txThisMonthByAccount` is keyed by LOCAL account id. Callers may pass any
 *   superset of the month's rows; the window filter is applied here.
 */
export function snapshotsFromPlaidBalances(
  accounts: PlaidBalanceAccount[],
  todayISO: string,
  txThisMonthByAccount: Map<string, MonthTx[]>,
): SnapshotRow[] {
  const asOf = monthOfISO(todayISO)
  const rows: SnapshotRow[] = []
  for (const a of accounts) {
    const current = a.balances.current
    if (current === null || current === undefined || !Number.isFinite(current)) continue
    // accountBalanceAt applies `-amount` on assets and `+amount` on
    // liabilities (a purchase raises what you owe), so rolling back to the
    // 1st means undoing that same effect.
    const effect = LIABILITY_TYPES.has(a.type) ? 1 : -1
    let rollback = 0
    for (const tx of txThisMonthByAccount.get(a.localAccountId) ?? []) {
      if (tx.occurred_on > asOf && tx.occurred_on <= todayISO) rollback -= effect * tx.amount_cents
    }
    rows.push({
      account_id: a.localAccountId,
      as_of_month: asOf,
      balance_cents: plaidBalanceToCents(current) + rollback,
    })
  }
  return rows
}
