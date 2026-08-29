import { describe, expect, it } from 'vitest'
import {
  isDuplicateRule,
  planCategoryChange,
  planShareChanges,
  prefillRuleFromTransaction,
  resolveRuleEffects,
  resolveShareWeights,
  ruleMatches,
  sortRules,
  type TransactionRule,
} from './transaction-rules'

const rule = (over: Partial<TransactionRule> & { id: string }): TransactionRule => ({
  household_id: 'hh',
  name: over.id,
  enabled: true,
  sort_order: 0,
  match_text: 'netflix',
  amount_min_cents: null,
  amount_max_cents: null,
  account_id: null,
  direction: 'outflow',
  share_mode: 'household',
  share_weights: null,
  category_id: null,
  is_settlement: false,
  ...over,
})

const tx = (over: Partial<Parameters<typeof ruleMatches>[1]> = {}) => ({
  id: 't1',
  description: 'NETFLIX.COM 12345',
  amount_cents: 1699,
  account_id: 'acct-1',
  member_id: 'a',
  ...over,
})

describe('ruleMatches', () => {
  it('normalised contains, case/digits/punctuation insensitive', () => {
    expect(ruleMatches(rule({ id: 'r' }), tx())).toBe(true)
    expect(ruleMatches(rule({ id: 'r', match_text: 'Net Flix' }), tx())).toBe(false)
    expect(ruleMatches(rule({ id: 'r', match_text: 'FLIX' }), tx({ description: 'netflix' }))).toBe(true)
    expect(ruleMatches(rule({ id: 'r', match_text: 'spotify' }), tx())).toBe(false)
  })
  it('empty needle never matches; disabled never matches', () => {
    expect(ruleMatches(rule({ id: 'r', match_text: '123 !!' }), tx())).toBe(false)
    expect(ruleMatches(rule({ id: 'r', enabled: false }), tx())).toBe(false)
  })
  it('direction', () => {
    expect(ruleMatches(rule({ id: 'r', direction: 'outflow' }), tx({ amount_cents: -5 }))).toBe(false)
    expect(ruleMatches(rule({ id: 'r', direction: 'inflow' }), tx({ amount_cents: -5 }))).toBe(true)
    expect(ruleMatches(rule({ id: 'r', direction: 'any' }), tx({ amount_cents: -5 }))).toBe(true)
  })
  it('inclusive amount bounds on abs', () => {
    expect(ruleMatches(rule({ id: 'r', amount_min_cents: 1699, amount_max_cents: 1699 }), tx())).toBe(true)
    expect(ruleMatches(rule({ id: 'r', amount_min_cents: 1700 }), tx())).toBe(false)
    expect(ruleMatches(rule({ id: 'r', amount_max_cents: 1698 }), tx())).toBe(false)
    expect(ruleMatches(rule({ id: 'r', direction: 'inflow', amount_min_cents: 1000 }), tx({ amount_cents: -1699 }))).toBe(true)
  })
  it('account filter', () => {
    expect(ruleMatches(rule({ id: 'r', account_id: 'acct-1' }), tx())).toBe(true)
    expect(ruleMatches(rule({ id: 'r', account_id: 'acct-2' }), tx())).toBe(false)
  })
})

describe('precedence', () => {
  it('sorts by sort_order then id and drops disabled', () => {
    const out = sortRules([rule({ id: 'b', sort_order: 1 }), rule({ id: 'a', sort_order: 1 }), rule({ id: 'z', sort_order: 0 }), rule({ id: 'x', enabled: false })])
    expect(out.map((r) => r.id)).toEqual(['z', 'a', 'b'])
  })
  it('first-wins per action: share from one rule, category from another', () => {
    const catOnly = rule({ id: 'cat', sort_order: 0, share_mode: 'none', category_id: 'c1' })
    const shareOnly = rule({ id: 'share', sort_order: 1, share_mode: 'household' })
    const both = rule({ id: 'both', sort_order: 2, share_mode: 'custom', share_weights: { a: 1 }, category_id: 'c2' })
    const fx = resolveRuleEffects([both, shareOnly, catOnly], tx())
    expect(fx.categoryRule?.id).toBe('cat')
    expect(fx.shareRule?.id).toBe('share')
    expect(fx.matched.map((r) => r.id)).toEqual(['cat', 'share'])
  })
  it('no match → nulls', () => {
    const fx = resolveRuleEffects([rule({ id: 'r', match_text: 'spotify' })], tx())
    expect(fx.shareRule).toBeNull()
    expect(fx.categoryRule).toBeNull()
    expect(fx.settlementRule).toBeNull()
  })
  it('a settlement rule wins over a later share rule and blocks sharing', () => {
    const pay = rule({ id: 'pay', sort_order: 0, share_mode: 'none', is_settlement: true })
    const share = rule({ id: 'share', sort_order: 1, share_mode: 'household', category_id: 'c1' })
    const fx = resolveRuleEffects([share, pay], tx())
    expect(fx.settlementRule?.id).toBe('pay')
    expect(fx.shareRule).toBeNull()
    expect(fx.categoryRule?.id).toBe('share')
  })
})

describe('resolveShareWeights', () => {
  const active = [
    { id: 'a', weight: 3 },
    { id: 'b', weight: 2 },
  ]
  it('household → active weights as-is', () => {
    expect(resolveShareWeights(rule({ id: 'r' }), active)).toEqual(active)
  })
  it('custom → only listed active members, archived/unknown dropped', () => {
    expect(resolveShareWeights(rule({ id: 'r', share_mode: 'custom', share_weights: { a: 1, ghost: 5, b: 0 } }), active)).toEqual([{ id: 'a', weight: 1 }])
  })
})

describe('planShareChanges', () => {
  const computed = [{ member_id: 'b', amount_cents: 850 }]
  it('any manual row blocks the rule', () => {
    expect(planShareChanges([{ member_id: 'b', amount_cents: 1, rule_id: null }], computed, 'r')).toEqual({ kind: 'skip-manual' })
  })
  it('identical rule rows → noop', () => {
    expect(planShareChanges([{ member_id: 'b', amount_cents: 850, rule_id: 'r' }], computed, 'r')).toEqual({ kind: 'noop' })
  })
  it('different amounts or different rule → replace', () => {
    expect(planShareChanges([{ member_id: 'b', amount_cents: 800, rule_id: 'r' }], computed, 'r')).toEqual({ kind: 'replace', rows: computed })
    expect(planShareChanges([{ member_id: 'b', amount_cents: 850, rule_id: 'other' }], computed, 'r')).toEqual({ kind: 'replace', rows: computed })
  })
  it('nothing existing, nothing computed → noop; nothing existing, computed → replace', () => {
    expect(planShareChanges([], [], 'r')).toEqual({ kind: 'noop' })
    expect(planShareChanges([], computed, 'r')).toEqual({ kind: 'replace', rows: computed })
  })
})

describe('planCategoryChange', () => {
  it('sets when empty or previously rule-set; skips manual and multi-split', () => {
    expect(planCategoryChange([{ id: 's', category_id: null, category_rule_id: null }], 'c')).toEqual({ kind: 'set', splitId: 's' })
    expect(planCategoryChange([{ id: 's', category_id: 'old', category_rule_id: 'r' }], 'c')).toEqual({ kind: 'set', splitId: 's' })
    expect(planCategoryChange([{ id: 's', category_id: 'old', category_rule_id: null }], 'c')).toEqual({ kind: 'skip' })
    expect(planCategoryChange([{ id: 's', category_id: 'c', category_rule_id: null }], 'c')).toEqual({ kind: 'noop' })
    expect(
      planCategoryChange(
        [
          { id: 's1', category_id: null, category_rule_id: null },
          { id: 's2', category_id: null, category_rule_id: null },
        ],
        'c',
      ),
    ).toEqual({ kind: 'skip' })
  })
})

describe('isDuplicateRule', () => {
  it('same normalised text, direction and category → duplicate', () => {
    expect(
      isDuplicateRule(
        { match_text: 'Netflix', direction: 'outflow', category_id: 'c1' },
        { match_text: '  netflix!!', direction: 'outflow', category_id: 'c1' },
      ),
    ).toBe(true)
  })
  it('different direction, category, or merchant → not a duplicate', () => {
    const base = { match_text: 'Netflix', direction: 'outflow' as const, category_id: 'c1' }
    expect(isDuplicateRule(base, { ...base, direction: 'inflow' })).toBe(false)
    expect(isDuplicateRule(base, { ...base, category_id: 'c2' })).toBe(false)
    expect(isDuplicateRule(base, { ...base, category_id: null })).toBe(false)
    expect(isDuplicateRule(base, { ...base, match_text: 'Spotify' })).toBe(false)
  })
  it('null categories match each other', () => {
    expect(
      isDuplicateRule(
        { match_text: 'Netflix', direction: 'any', category_id: null },
        { match_text: 'netflix', direction: 'any', category_id: null },
      ),
    ).toBe(true)
  })
})

describe('prefillRuleFromTransaction', () => {
  it('normalises merchant, bands amount ±10%, infers direction', () => {
    const p = prefillRuleFromTransaction(tx({ description: 'Hydro One Bill #778', amount_cents: 12000 }))
    expect(p.match_text).toBe('HYDRO ONE BILL')
    expect(p.name).toBe('Hydro One Bill')
    expect(p.amount_min_cents).toBe(10800)
    expect(p.amount_max_cents).toBe(13200)
    expect(p.direction).toBe('outflow')
    expect(prefillRuleFromTransaction(tx({ amount_cents: -500 })).direction).toBe('inflow')
  })
})
