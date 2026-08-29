import { describe, expect, it } from 'vitest'
import { accountBalanceAt, groupSnapsByAccount, groupTxByAccount, isManuallyEditableBalance, netWorthAt } from './balances'

const MONTH = '2026-08-01'

describe('accountBalanceAt sign conventions', () => {
  it('asset account: outflow lowers, inflow raises', () => {
    const tx = groupTxByAccount([
      { account_id: 'chq', occurred_on: '2026-08-02', amount_cents: 5000 }, // spent $50
      { account_id: 'chq', occurred_on: '2026-08-10', amount_cents: -20000 }, // paycheque $200
    ])
    const bal = accountBalanceAt({ id: 'chq', type: 'chequing', opening_balance_cents: 10000 }, MONTH, tx, new Map())
    expect(bal).toBe(10000 - 5000 + 20000)
  })

  it('liability account: a purchase raises what you owe, a payment lowers it', () => {
    const tx = groupTxByAccount([
      { account_id: 'cc', occurred_on: '2026-08-02', amount_cents: 32900 }, // purchase $329
      { account_id: 'cc', occurred_on: '2026-08-15', amount_cents: -10000 }, // payment $100
    ])
    const bal = accountBalanceAt({ id: 'cc', type: 'credit_card', opening_balance_cents: 0 }, MONTH, tx, new Map())
    expect(bal).toBe(32900 - 10000)
  })

  it('net worth subtracts owing from having', () => {
    const accounts = [
      { id: 'chq', type: 'chequing' as const, opening_balance_cents: 100000 },
      { id: 'cc', type: 'credit_card' as const, opening_balance_cents: 25000 },
    ]
    const tx = groupTxByAccount([{ account_id: 'cc', occurred_on: '2026-08-02', amount_cents: 5000 }])
    expect(netWorthAt(accounts, MONTH, tx, new Map())).toBe(100000 - 30000)
  })

  it('a snapshot anchors the balance and only later transactions apply', () => {
    const tx = groupTxByAccount([
      { account_id: 'cc', occurred_on: '2026-07-20', amount_cents: 99999 }, // before the anchor: ignored
      { account_id: 'cc', occurred_on: '2026-08-05', amount_cents: 1000 },
    ])
    const snaps = groupSnapsByAccount([{ account_id: 'cc', as_of_month: MONTH, balance_cents: 50000 }])
    const bal = accountBalanceAt({ id: 'cc', type: 'credit_card', opening_balance_cents: 0 }, MONTH, tx, snaps)
    expect(bal).toBe(50000 + 1000)
  })
})

describe('isManuallyEditableBalance', () => {
  it('a linked (Plaid) account cannot take a typed balance - the bank always wins', () => {
    expect(isManuallyEditableBalance({ plaid_account_id: 'plaid-acc-123' })).toBe(false)
  })

  it('a manual account can be typed in', () => {
    expect(isManuallyEditableBalance({ plaid_account_id: null })).toBe(true)
  })
})
