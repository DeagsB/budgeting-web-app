import { describe, expect, it } from 'vitest'
import type { RemovedTransaction, Transaction } from 'plaid'
import {
  classifyPlaidError,
  isUniqueViolation,
  planSplitUpdate,
  planSyncBatch,
  plaidErrorCode,
} from './plaid-sync-plan'

const tx = (over: Partial<Transaction> & { transaction_id: string }): Transaction =>
  ({
    account_id: 'acct',
    amount: 10,
    date: '2026-08-10',
    name: 'X',
    pending: false,
    pending_transaction_id: null,
    ...over,
  }) as Transaction

const removed = (id: string): RemovedTransaction => ({ transaction_id: id, account_id: 'acct' }) as RemovedTransaction

describe('planSyncBatch', () => {
  it('pairs a posted add with its removed pending id as a migration', () => {
    const plan = planSyncBatch({
      added: [tx({ transaction_id: 'posted-1', pending_transaction_id: 'pend-1' })],
      modified: [],
      removed: [removed('pend-1')],
    })
    expect(plan.migrations).toEqual([{ pendingId: 'pend-1', posted: expect.objectContaining({ transaction_id: 'posted-1' }) }])
    expect(plan.inserts).toEqual([])
    expect(plan.deletes).toEqual([])
  })

  it('treats a posted add whose pending id was NOT removed as a plain insert', () => {
    const plan = planSyncBatch({
      added: [tx({ transaction_id: 'posted-1', pending_transaction_id: 'pend-1' })],
      modified: [],
      removed: [],
    })
    expect(plan.migrations).toEqual([])
    expect(plan.inserts.map((t) => t.transaction_id)).toEqual(['posted-1'])
  })

  it('deletes removed ids that were not migrated', () => {
    const plan = planSyncBatch({
      added: [],
      modified: [],
      removed: [removed('gone-1'), removed('gone-2')],
    })
    expect(plan.deletes.sort()).toEqual(['gone-1', 'gone-2'])
  })

  it('claims each pending id at most once', () => {
    const plan = planSyncBatch({
      added: [
        tx({ transaction_id: 'a', pending_transaction_id: 'pend-1' }),
        tx({ transaction_id: 'b', pending_transaction_id: 'pend-1' }),
      ],
      modified: [],
      removed: [removed('pend-1')],
    })
    expect(plan.migrations).toHaveLength(1)
    expect(plan.inserts.map((t) => t.transaction_id)).toEqual(['b'])
  })

  it('passes modified through as updates', () => {
    const plan = planSyncBatch({ added: [], modified: [tx({ transaction_id: 'm' })], removed: [] })
    expect(plan.updates.map((t) => t.transaction_id)).toEqual(['m'])
  })

  it('ignores removed entries without a transaction_id', () => {
    const plan = planSyncBatch({
      added: [],
      modified: [],
      removed: [{ account_id: 'acct' } as RemovedTransaction],
    })
    expect(plan.deletes).toEqual([])
  })
})

describe('planSplitUpdate', () => {
  it('noop when no splits', () => {
    expect(planSplitUpdate([], 500)).toEqual({ kind: 'noop' })
  })

  it('single split follows the new amount', () => {
    expect(planSplitUpdate([{ id: 's1', amount_cents: 400 }], 500)).toEqual({ kind: 'set-single', id: 's1', amount_cents: 500 })
  })

  it('single split already equal is a noop', () => {
    expect(planSplitUpdate([{ id: 's1', amount_cents: 500 }], 500)).toEqual({ kind: 'noop' })
  })

  it('multi split that still sums is a noop', () => {
    expect(
      planSplitUpdate(
        [
          { id: 's1', amount_cents: 200 },
          { id: 's2', amount_cents: 300 },
        ],
        500,
      ),
    ).toEqual({ kind: 'noop' })
  })

  it('multi split that no longer sums is flagged, never rescaled', () => {
    expect(
      planSplitUpdate(
        [
          { id: 's1', amount_cents: 200 },
          { id: 's2', amount_cents: 300 },
        ],
        600,
      ),
    ).toEqual({ kind: 'flag-review' })
  })
})

describe('classifyPlaidError', () => {
  it('maps known codes', () => {
    expect(classifyPlaidError('ITEM_LOGIN_REQUIRED')).toBe('reauth')
    expect(classifyPlaidError('PENDING_DISCONNECT')).toBe('reauth')
    expect(classifyPlaidError('USER_PERMISSION_REVOKED')).toBe('revoked')
    expect(classifyPlaidError('RATE_LIMIT_EXCEEDED')).toBe('transient')
    expect(classifyPlaidError('INSTITUTION_DOWN')).toBe('transient')
  })

  it('unknown or missing codes are fatal', () => {
    expect(classifyPlaidError('SOMETHING_NEW')).toBe('fatal')
    expect(classifyPlaidError(null)).toBe('fatal')
    expect(classifyPlaidError(undefined)).toBe('fatal')
  })
})

describe('plaidErrorCode / isUniqueViolation', () => {
  it('digs error_code out of an Axios-shaped error', () => {
    expect(plaidErrorCode({ response: { data: { error_code: 'ITEM_LOGIN_REQUIRED' } } })).toBe('ITEM_LOGIN_REQUIRED')
    expect(plaidErrorCode(new Error('boom'))).toBeNull()
    expect(plaidErrorCode(null)).toBeNull()
  })

  it('recognises Postgres unique violations only', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
