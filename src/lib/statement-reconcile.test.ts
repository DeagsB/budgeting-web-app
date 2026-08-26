import { describe, expect, it } from 'vitest'
import { reconcileRows, type ExistingTx } from './statement-reconcile'

const existing = (over: Partial<ExistingTx> & { id: string }): ExistingTx => ({
  account_id: 'acct-1',
  occurred_on: '2026-08-10',
  amount_cents: 1234,
  description: 'COFFEE',
  source: 'email_alert',
  ...over,
})

describe('reconcileRows', () => {
  it('matches same account + same signed amount within tolerance', () => {
    const [m] = reconcileRows(
      [{ account_id: 'acct-1', occurred_on: '2026-08-12', amount_cents: 1234 }],
      [existing({ id: 'e1' })],
    )
    expect(m.matchedTxId).toBe('e1')
    expect(m.matchedSource).toBe('email_alert')
  })

  it('does not match across accounts', () => {
    const [m] = reconcileRows(
      [{ account_id: 'acct-2', occurred_on: '2026-08-10', amount_cents: 1234 }],
      [existing({ id: 'e1' })],
    )
    expect(m.matchedTxId).toBeNull()
  })

  it('does not match a different sign', () => {
    const [m] = reconcileRows(
      [{ account_id: 'acct-1', occurred_on: '2026-08-10', amount_cents: -1234 }],
      [existing({ id: 'e1' })],
    )
    expect(m.matchedTxId).toBeNull()
  })

  it('respects the day tolerance (inclusive)', () => {
    const rows = [{ account_id: 'acct-1', occurred_on: '2026-08-15', amount_cents: 1234 }]
    expect(reconcileRows(rows, [existing({ id: 'e1' })], { toleranceDays: 5 })[0].matchedTxId).toBe('e1')
    expect(reconcileRows(rows, [existing({ id: 'e1' })], { toleranceDays: 4 })[0].matchedTxId).toBeNull()
  })

  it('claims each existing transaction at most once', () => {
    const rows = [
      { account_id: 'acct-1', occurred_on: '2026-08-10', amount_cents: 420 },
      { account_id: 'acct-1', occurred_on: '2026-08-10', amount_cents: 420 },
    ]
    const res = reconcileRows(rows, [existing({ id: 'e1', amount_cents: 420 })])
    expect(res[0].matchedTxId).toBe('e1')
    expect(res[1].matchedTxId).toBeNull()
  })

  it('prefers the closest date, then email alerts', () => {
    const res = reconcileRows(
      [{ account_id: 'acct-1', occurred_on: '2026-08-10', amount_cents: 1234 }],
      [
        existing({ id: 'far', occurred_on: '2026-08-13', source: 'email_alert' }),
        existing({ id: 'near-manual', occurred_on: '2026-08-11', source: 'manual' }),
        existing({ id: 'near-alert', occurred_on: '2026-08-11', source: 'email_alert' }),
      ],
    )
    expect(res[0].matchedTxId).toBe('near-alert')
  })

  it('never matches on malformed dates', () => {
    const [m] = reconcileRows(
      [{ account_id: 'acct-1', occurred_on: 'nope', amount_cents: 1234 }],
      [existing({ id: 'e1' })],
    )
    expect(m.matchedTxId).toBeNull()
  })
})
