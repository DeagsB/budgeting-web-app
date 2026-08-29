/**
 * "To categorize" dashboard card - household-wide, across every month
 * (unlike the transactions page's per-month view), a count of editable
 * transactions that still need a category, their total dollar value, and
 * how many distinct accounts they touch.
 *
 * Lives beside the dashboard page rather than in `src/lib` because this
 * agent's file ownership for this task is scoped to
 * `src/app/(app)/dashboard/` - see the task brief. The pure-logic-gets-a-test
 * rule still applies; it just lives here instead.
 */
import { isTxEditable } from '@/lib/tx-scope'

export type InboxTx = {
  id: string
  account_id: string
  member_id: string | null
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
}

export type InboxSplit = { transaction_id: string; category_id: string | null }

export type InboxSummary = {
  count: number
  amountCents: number
  accountCount: number
  /** True when at least one uncategorized transaction predates `currentMonth`. */
  hasEarlierMonths: boolean
}

/**
 * A transaction is uncategorized when it has at most one split and that
 * split's category is null - a multi-split transaction is always
 * categorized. Mirrors the rule in transactions/page.tsx exactly.
 */
function isUncategorized(splits: { category_id: string | null }[]): boolean {
  return splits.length <= 1 && (splits[0]?.category_id ?? null) === null
}

/**
 * @param transactions   Household transactions (any month up to "now").
 * @param splits         Every split ever recorded for those transactions.
 * @param accountVisibleIds  Ids of accounts visible to this login (own + joint).
 * @param myMemberId     The signed-in member, for the "I paid it" editability carve-out.
 * @param currentMonth   YYYY-MM-01 - transactions dated before this count as "earlier".
 */
export function computeInboxSummary(
  transactions: InboxTx[],
  splits: InboxSplit[],
  accountVisibleIds: Set<string>,
  myMemberId: string | null,
  currentMonth: string,
): InboxSummary {
  const splitsByTx = new Map<string, { category_id: string | null }[]>()
  for (const s of splits) {
    const list = splitsByTx.get(s.transaction_id)
    if (list) list.push({ category_id: s.category_id })
    else splitsByTx.set(s.transaction_id, [{ category_id: s.category_id }])
  }

  let count = 0
  let amountCents = 0
  let hasEarlierMonths = false
  const accountIds = new Set<string>()

  for (const t of transactions) {
    const editable = isTxEditable({
      accountVisible: accountVisibleIds.has(t.account_id),
      payerId: t.member_id,
      myMemberId,
    })
    if (!editable) continue
    if (!isUncategorized(splitsByTx.get(t.id) ?? [])) continue

    count += 1
    amountCents += Math.abs(t.amount_cents)
    accountIds.add(t.account_id)
    if (t.occurred_on < currentMonth) hasEarlierMonths = true
  }

  return { count, amountCents, accountCount: accountIds.size, hasEarlierMonths }
}
