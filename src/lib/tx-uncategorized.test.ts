import { describe, expect, it } from 'vitest'
import { isUncategorizedSplitSet } from './tx-uncategorized'

describe('isUncategorizedSplitSet', () => {
  it('zero splits is uncategorized', () => {
    expect(isUncategorizedSplitSet([])).toBe(true)
  })

  it('one split with no category is uncategorized', () => {
    expect(isUncategorizedSplitSet([{ category_id: null }])).toBe(true)
  })

  it('one split with a category is categorized', () => {
    expect(isUncategorizedSplitSet([{ category_id: 'cat-1' }])).toBe(false)
  })

  it('multiple splits are always categorized, even if every one is null', () => {
    expect(isUncategorizedSplitSet([{ category_id: null }, { category_id: null }])).toBe(false)
    expect(isUncategorizedSplitSet([{ category_id: 'cat-1' }, { category_id: null }])).toBe(false)
  })
})
