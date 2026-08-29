/**
 * "Left to spend" dashboard widget - per top-level category, how much of
 * this month's effective budget is left (or blown through).
 *
 * Lives beside the dashboard page rather than in `src/lib` for the same
 * file-ownership reason documented in `./inbox.ts`.
 */

export type BudgetCategory = { id: string; name: string; parent_id: string | null }

export type CategoryBudgetRow = {
  id: string
  name: string
  budget: number
  spent: number
  left: number
}

/**
 * Every top-level category with a nonzero effective budget this month (an
 * explicit $0 override means "not budgeted this month", the same
 * convention the /budgets page uses), sorted overspent first and then by
 * smallest amount left, capped at `limit`.
 *
 * `spendByCategory` must already have child spend rolled into the parent -
 * callers pass the same map used for the "Where it went" breakdown so the
 * two widgets never disagree.
 */
export function categoryBudgetsLeftToSpend(
  categories: BudgetCategory[],
  budgetByCat: Map<string, number>,
  spendByCategory: Map<string, number>,
  limit = 5,
): CategoryBudgetRow[] {
  return categories
    .filter((c) => !c.parent_id && (budgetByCat.get(c.id) ?? 0) > 0)
    .map((c) => {
      const budget = budgetByCat.get(c.id) ?? 0
      const spent = spendByCategory.get(c.id) ?? 0
      return { id: c.id, name: c.name, budget, spent, left: budget - spent }
    })
    .sort((a, b) => a.left - b.left)
    .slice(0, limit)
}
