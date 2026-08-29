import { describe, expect, it } from 'vitest'
import { categoryBudgetsLeftToSpend, type BudgetCategory } from './category-budgets'

const CATEGORIES: BudgetCategory[] = [
  { id: 'groceries', name: 'Groceries', parent_id: null },
  { id: 'dining', name: 'Dining', parent_id: null },
  { id: 'restaurants', name: 'Restaurants', parent_id: 'dining' },
  { id: 'transport', name: 'Transport', parent_id: null },
  { id: 'unbudgeted', name: 'Unbudgeted', parent_id: null },
]

describe('categoryBudgetsLeftToSpend', () => {
  it('excludes categories with no effective budget', () => {
    const budgetByCat = new Map([['groceries', 50000]])
    const spendByCategory = new Map<string, number>()
    const rows = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, spendByCategory)
    expect(rows.map((r) => r.id)).toEqual(['groceries'])
  })

  it('excludes an explicit $0 budget (not budgeted this month)', () => {
    const budgetByCat = new Map([
      ['groceries', 0],
      ['transport', 10000],
    ])
    const rows = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, new Map())
    expect(rows.map((r) => r.id)).toEqual(['transport'])
  })

  it('excludes child categories even when individually budgeted', () => {
    const budgetByCat = new Map([['restaurants', 10000]])
    const rows = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, new Map())
    expect(rows).toEqual([])
  })

  it('computes left = budget - spent', () => {
    const budgetByCat = new Map([['groceries', 50000]])
    const spendByCategory = new Map([['groceries', 30000]])
    const [row] = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, spendByCategory)
    expect(row).toEqual({ id: 'groceries', name: 'Groceries', budget: 50000, spent: 30000, left: 20000 })
  })

  it('goes negative when overspent', () => {
    const budgetByCat = new Map([['groceries', 50000]])
    const spendByCategory = new Map([['groceries', 60000]])
    const [row] = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, spendByCategory)
    expect(row.left).toBe(-10000)
  })

  it('sorts overspent first, then smallest amount left', () => {
    const budgetByCat = new Map([
      ['groceries', 50000], // spent 60000 -> left -10000 (overspent)
      ['dining', 20000], // spent 25000 -> left -5000 (overspent, less than groceries)
      ['transport', 10000], // spent 2000 -> left 8000
      ['unbudgeted', 5000], // spent 1000 -> left 4000 (smallest positive)
    ])
    const spendByCategory = new Map([
      ['groceries', 60000],
      ['dining', 25000],
      ['transport', 2000],
      ['unbudgeted', 1000],
    ])
    const rows = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, spendByCategory)
    expect(rows.map((r) => r.id)).toEqual(['groceries', 'dining', 'unbudgeted', 'transport'])
  })

  it('caps at the given limit', () => {
    const many: BudgetCategory[] = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`,
      name: `Cat ${i}`,
      parent_id: null,
    }))
    const budgetByCat = new Map(many.map((c) => [c.id, 10000]))
    const rows = categoryBudgetsLeftToSpend(many, budgetByCat, new Map(), 5)
    expect(rows).toHaveLength(5)
  })

  it('treats an unset budget as 0% used for a zero-budget edge case (division guarded upstream)', () => {
    const budgetByCat = new Map([['groceries', 100]])
    const rows = categoryBudgetsLeftToSpend(CATEGORIES, budgetByCat, new Map())
    expect(rows[0].spent).toBe(0)
    expect(rows[0].left).toBe(100)
  })

  it('returns an empty list when nothing is budgeted', () => {
    expect(categoryBudgetsLeftToSpend(CATEGORIES, new Map(), new Map())).toEqual([])
  })
})
