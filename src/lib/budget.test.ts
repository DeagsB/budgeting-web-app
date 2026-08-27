import { describe, it, expect } from 'vitest'
import { effectiveBudgets, budgetTotals, monthsInRange } from './budget'

const standing = [
  { category_id: 'food', amount_cents: 60000 },
  { category_id: 'housing', amount_cents: 200000 },
]

describe('effectiveBudgets', () => {
  it('uses the standing amount when the month has no override', () => {
    const m = effectiveBudgets(standing, [], '2026-08-01')
    expect(m.get('food')).toBe(60000)
    expect(m.get('housing')).toBe(200000)
  })

  it('lets an override for that month win', () => {
    const m = effectiveBudgets(standing, [{ category_id: 'food', month: '2026-08-01', amount_cents: 90000 }], '2026-08-01')
    expect(m.get('food')).toBe(90000)
    expect(m.get('housing')).toBe(200000)
  })

  it('ignores overrides from other months', () => {
    const m = effectiveBudgets(standing, [{ category_id: 'food', month: '2026-07-01', amount_cents: 90000 }], '2026-08-01')
    expect(m.get('food')).toBe(60000)
  })

  it('honours a zero override - that is a real "no budget this month"', () => {
    const m = effectiveBudgets(standing, [{ category_id: 'food', month: '2026-08-01', amount_cents: 0 }], '2026-08-01')
    expect(m.get('food')).toBe(0)
  })

  it('reports a category with neither standing nor override as absent, not zero', () => {
    const m = effectiveBudgets(standing, [], '2026-08-01')
    expect(m.has('travel')).toBe(false)
  })
})

describe('monthsInRange', () => {
  it('is inclusive of both ends', () => {
    expect(monthsInRange('2026-01-01', '2026-03-01')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
  })

  it('returns the single month when start equals end', () => {
    expect(monthsInRange('2026-08-01', '2026-08-01')).toEqual(['2026-08-01'])
  })

  it('returns nothing when the range runs backwards', () => {
    expect(monthsInRange('2026-08-01', '2026-07-01')).toEqual([])
  })

  it('crosses a year boundary', () => {
    expect(monthsInRange('2025-11-01', '2026-02-01')).toEqual([
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
    ])
  })
})

describe('budgetTotals', () => {
  it('sums the standing amount across every month in the range', () => {
    const t = budgetTotals(standing, [], ['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(t.get('food')).toBe(180000)
    expect(t.get('housing')).toBe(600000)
  })

  it('substitutes the override in the months that have one', () => {
    const overrides = [
      { category_id: 'food', month: '2026-02-01', amount_cents: 100000 },
      { category_id: 'food', month: '2026-03-01', amount_cents: 0 },
    ]
    const t = budgetTotals(standing, overrides, ['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(t.get('food')).toBe(60000 + 100000 + 0)
  })

  it('counts a category that only ever had overrides', () => {
    const overrides = [{ category_id: 'gift', month: '2026-02-01', amount_cents: 25000 }]
    const t = budgetTotals(standing, overrides, ['2026-01-01', '2026-02-01'])
    expect(t.get('gift')).toBe(25000)
  })

  it('is empty for an empty month list', () => {
    expect(budgetTotals(standing, [], []).size).toBe(0)
  })
})
