import { describe, expect, it } from 'vitest'
import { computeInboxSummary, type InboxSplit, type InboxTx } from './inbox'

const VISIBLE = new Set(['acc-1', 'acc-2'])

function tx(overrides: Partial<InboxTx> & { id: string }): InboxTx {
  return {
    account_id: 'acc-1',
    member_id: 'me',
    occurred_on: '2026-08-15',
    amount_cents: 1000,
    ...overrides,
  }
}

describe('computeInboxSummary', () => {
  it('counts a transaction with zero splits as uncategorized', () => {
    const summary = computeInboxSummary([tx({ id: 't1' })], [], VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(1)
    expect(summary.amountCents).toBe(1000)
    expect(summary.accountCount).toBe(1)
  })

  it('counts a single split with a null category as uncategorized', () => {
    const splits: InboxSplit[] = [{ transaction_id: 't1', category_id: null }]
    const summary = computeInboxSummary([tx({ id: 't1' })], splits, VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(1)
  })

  it('excludes a single split that has a category', () => {
    const splits: InboxSplit[] = [{ transaction_id: 't1', category_id: 'cat-groceries' }]
    const summary = computeInboxSummary([tx({ id: 't1' })], splits, VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(0)
    expect(summary.amountCents).toBe(0)
  })

  it('treats a multi-split transaction as always categorized, even with a null category among the splits', () => {
    const splits: InboxSplit[] = [
      { transaction_id: 't1', category_id: 'cat-groceries' },
      { transaction_id: 't1', category_id: null },
    ]
    const summary = computeInboxSummary([tx({ id: 't1' })], splits, VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(0)
  })

  it('excludes a read-only crossover transaction (invisible account, someone else paid)', () => {
    const t = tx({ id: 't1', account_id: 'acc-hidden', member_id: 'other' })
    const summary = computeInboxSummary([t], [], VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(0)
  })

  it('includes a transaction the signed-in member paid even on an invisible account', () => {
    const t = tx({ id: 't1', account_id: 'acc-hidden', member_id: 'me' })
    const summary = computeInboxSummary([t], [], VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(1)
  })

  it('sums the absolute value across signs so inflow and outflow do not cancel out', () => {
    const txs = [
      tx({ id: 't1', amount_cents: 500 }),
      tx({ id: 't2', amount_cents: -300 }),
    ]
    const summary = computeInboxSummary(txs, [], VISIBLE, 'me', '2026-08-01')
    expect(summary.amountCents).toBe(800)
  })

  it('counts distinct accounts, not transactions', () => {
    const txs = [
      tx({ id: 't1', account_id: 'acc-1' }),
      tx({ id: 't2', account_id: 'acc-1' }),
      tx({ id: 't3', account_id: 'acc-2' }),
    ]
    const summary = computeInboxSummary(txs, [], VISIBLE, 'me', '2026-08-01')
    expect(summary.count).toBe(3)
    expect(summary.accountCount).toBe(2)
  })

  it('flags hasEarlierMonths only when an uncategorized row predates currentMonth', () => {
    const inCurrentMonth = computeInboxSummary(
      [tx({ id: 't1', occurred_on: '2026-08-15' })],
      [],
      VISIBLE,
      'me',
      '2026-08-01',
    )
    expect(inCurrentMonth.hasEarlierMonths).toBe(false)

    const inEarlierMonth = computeInboxSummary(
      [tx({ id: 't1', occurred_on: '2026-07-15' })],
      [],
      VISIBLE,
      'me',
      '2026-08-01',
    )
    expect(inEarlierMonth.hasEarlierMonths).toBe(true)
  })

  it('does not flag hasEarlierMonths for an earlier-month row that is already categorized', () => {
    const splits: InboxSplit[] = [{ transaction_id: 't1', category_id: 'cat-groceries' }]
    const summary = computeInboxSummary(
      [tx({ id: 't1', occurred_on: '2026-07-15' })],
      splits,
      VISIBLE,
      'me',
      '2026-08-01',
    )
    expect(summary.hasEarlierMonths).toBe(false)
  })

  it('returns all zeros for an empty household', () => {
    const summary = computeInboxSummary([], [], VISIBLE, 'me', '2026-08-01')
    expect(summary).toEqual({ count: 0, amountCents: 0, accountCount: 0, hasEarlierMonths: false })
  })
})
