/**
 * Budgets are standing, not monthly.
 *
 * `category_budgets` holds one amount per category that applies to every
 * month until it is changed. `monthly_budgets` holds the exceptions: a row
 * there overrides the standing amount for that one month (including an
 * explicit zero, which means "nothing budgeted this month"). A category with
 * neither is simply not budgeted - absent from the map, never a zero.
 */

import { addMonthsISO } from '@/lib/dates'

export type StandingBudget = { category_id: string; amount_cents: number | string }
export type BudgetOverride = { category_id: string; month: string; amount_cents: number | string }

/** Effective budget per category for one month: the override if there is one, else the standing amount. */
export function effectiveBudgets(
  standing: StandingBudget[],
  overrides: BudgetOverride[],
  month: string,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of standing) out.set(s.category_id, Number(s.amount_cents))
  for (const o of overrides) {
    if (o.month !== month) continue
    out.set(o.category_id, Number(o.amount_cents))
  }
  return out
}

/** Every first-of-month between `from` and `to`, both inclusive. Empty if the range runs backwards. */
export function monthsInRange(from: string, to: string): string[] {
  const months: string[] = []
  let cursor = from
  while (cursor <= to) {
    months.push(cursor)
    cursor = addMonthsISO(cursor, 1)
  }
  return months
}

/** Sum of the effective budget per category across the given months - the year-to-date budget. */
export function budgetTotals(
  standing: StandingBudget[],
  overrides: BudgetOverride[],
  months: string[],
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const month of months) {
    for (const [id, cents] of effectiveBudgets(standing, overrides, month)) {
      totals.set(id, (totals.get(id) ?? 0) + cents)
    }
  }
  return totals
}
