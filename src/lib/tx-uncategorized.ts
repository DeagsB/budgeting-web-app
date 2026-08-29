/**
 * Shared "is this transaction uncategorized?" rule.
 *
 * A transaction is uncategorized when it has at most one split and that
 * split has no category. Multi-split transactions are always categorized -
 * splitting a transaction is itself an act of categorizing it, so a second
 * split (even an uncategorized one sitting alongside a categorized one)
 * never re-queues the row.
 *
 * Pure and household-agnostic: callers pass just the splits for one
 * transaction. Used both for the per-month list (`page.tsx`) and the
 * household-wide count query, so the two can never drift out of sync.
 */
export function isUncategorizedSplitSet(splits: { category_id: string | null }[]): boolean {
  return splits.length <= 1 && (splits[0]?.category_id ?? null) === null
}
