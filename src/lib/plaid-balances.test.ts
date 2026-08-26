import { describe, expect, it } from 'vitest'
import { accountBalanceAt, groupSnapsByAccount, groupTxByAccount } from './balances'
import { monthOfISO, plaidBalanceToCents, snapshotsFromPlaidBalances, type PlaidBalanceAccount } from './plaid-balances'

const TODAY = '2026-08-26'

function acct(over: Partial<PlaidBalanceAccount> = {}): PlaidBalanceAccount {
  return {
    plaidAccountId: 'plaid-1',
    localAccountId: 'local-1',
    type: 'savings',
    balances: { current: 1000, available: 950 },
    ...over,
  }
}

describe('plaidBalanceToCents', () => {
  it('rounds like plaidAmountToCents', () => {
    expect(plaidBalanceToCents(17550)).toBe(1755000)
    expect(plaidBalanceToCents(1.005)).toBe(100)
    expect(plaidBalanceToCents(-12.34)).toBe(-1234)
  })
  it('throws on non-finite', () => {
    expect(() => plaidBalanceToCents(Number.NaN)).toThrow()
  })
})

describe('monthOfISO', () => {
  it('returns the first of the month', () => {
    expect(monthOfISO('2026-08-26')).toBe('2026-08-01')
    expect(monthOfISO('2026-02-01')).toBe('2026-02-01')
  })
})

describe('snapshotsFromPlaidBalances', () => {
  it('writes the current month with balance rolled back to the 1st', () => {
    const tx = new Map([
      [
        'local-1',
        [
          { occurred_on: '2026-08-01', amount_cents: 999 }, // on the 1st: engine skips it, so do we
          { occurred_on: '2026-08-05', amount_cents: 5000 }, // outflow this month
          { occurred_on: '2026-08-20', amount_cents: -20000 }, // inflow this month
          { occurred_on: '2026-08-26', amount_cents: 300 }, // today counts
          { occurred_on: '2026-08-30', amount_cents: 700 }, // future: not in Plaid's number yet
          { occurred_on: '2026-07-31', amount_cents: 12345 }, // last month: baked into Plaid's number, not re-applied
        ],
      ],
    ])
    const rows = snapshotsFromPlaidBalances([acct()], TODAY, tx)
    expect(rows).toEqual([
      { account_id: 'local-1', as_of_month: '2026-08-01', balance_cents: 100000 + 5000 - 20000 + 300 },
    ])
  })

  it('round-trips through accountBalanceAt: derived balance today equals Plaid current', () => {
    // The whole point: an account opened at 0 with only outflows synced must
    // derive to Plaid's real balance, not to minus-the-outflows.
    const txs = [
      { account_id: 'local-1', occurred_on: '2026-06-10', amount_cents: 1000000 },
      { account_id: 'local-1', occurred_on: '2026-07-15', amount_cents: 500000 },
      { account_id: 'local-1', occurred_on: '2026-08-03', amount_cents: 200000 },
      { account_id: 'local-1', occurred_on: '2026-08-19', amount_cents: 55000 },
    ]
    const monthTx = new Map([['local-1', txs.filter((t) => t.occurred_on >= '2026-08-01')]])
    const rows = snapshotsFromPlaidBalances([acct({ balances: { current: 17550, available: null } })], TODAY, monthTx)
    const derived = accountBalanceAt(
      { id: 'local-1', type: 'savings', opening_balance_cents: 0 },
      '2026-08-01',
      groupTxByAccount(txs),
      groupSnapsByAccount(rows),
    )
    expect(derived).toBe(1755000)
  })

  it('keeps applying transactions dated after today on top of the anchor', () => {
    const txs = [
      { account_id: 'local-1', occurred_on: '2026-08-10', amount_cents: 1000 },
      { account_id: 'local-1', occurred_on: '2026-08-29', amount_cents: 2500 },
    ]
    const rows = snapshotsFromPlaidBalances([acct({ balances: { current: 100, available: null } })], TODAY, new Map([['local-1', txs]]))
    const derived = accountBalanceAt(
      { id: 'local-1', type: 'chequing', opening_balance_cents: 0 },
      '2026-08-01',
      groupTxByAccount(txs),
      groupSnapsByAccount(rows),
    )
    // Month-end view = Plaid current minus the not-yet-happened outflow.
    expect(derived).toBe(10000 - 2500)
  })

  it('stores liabilities as positive amount owed (no sign flip)', () => {
    const rows = snapshotsFromPlaidBalances(
      [
        acct({ localAccountId: 'cc', type: 'credit_card', balances: { current: 1234.56, available: 8765.44 } }),
        acct({ localAccountId: 'loan', type: 'loan', balances: { current: 250000, available: null } }),
        acct({ localAccountId: 'cc-credit', type: 'credit_card', balances: { current: -50, available: null } }),
      ],
      TODAY,
      new Map(),
    )
    expect(rows.map((r) => r.balance_cents)).toEqual([123456, 25000000, -5000])
  })

  it('skips accounts without a current balance rather than anchoring on available', () => {
    const rows = snapshotsFromPlaidBalances(
      [acct({ balances: { current: null, available: 500 } }), acct({ localAccountId: 'ok' })],
      TODAY,
      new Map(),
    )
    expect(rows).toEqual([{ account_id: 'ok', as_of_month: '2026-08-01', balance_cents: 100000 }])
  })

  it('ignores transactions of other accounts', () => {
    const tx = new Map([['someone-else', [{ occurred_on: '2026-08-10', amount_cents: 99999 }]]])
    const rows = snapshotsFromPlaidBalances([acct()], TODAY, tx)
    expect(rows[0].balance_cents).toBe(100000)
  })
})
