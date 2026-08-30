import { describe, expect, it } from 'vitest'
import {
  BARE_WINDOW_DAYS,
  TRANSFER_WINDOW_DAYS,
  dayDiff,
  hasTransferKeyword,
  hintFor,
  hintMatches,
  isTransferishPfc,
  legOwner,
  matchTransfers,
  pfcVeto,
  transferKind,
  type TransferAccount,
  type TransferRow,
} from './transfer-match'

const A = 'member-a'
const B = 'member-b'

const acct = (id: string, over: Partial<TransferAccount> = {}): TransferAccount => ({
  id,
  type: 'chequing',
  ownership: 'shared',
  member_id: null,
  ...over,
})

const row = (
  id: string,
  account_id: string,
  amount_cents: number,
  occurred_on: string,
  over: Partial<TransferRow> = {},
): TransferRow => ({
  id,
  account_id,
  amount_cents,
  occurred_on,
  transfer_ignored: false,
  linked: false,
  settlementCandidate: false,
  pfc_primary: null,
  pfc_detailed: null,
  description: null,
  ...over,
})

const ACCOUNTS = new Map<string, TransferAccount>([
  ['chq', acct('chq')],
  ['sav', acct('sav', { type: 'savings' })],
  ['visa', acct('visa', { type: 'credit_card' })],
  ['loan', acct('loan', { type: 'loan' })],
  ['tfsa', acct('tfsa', { type: 'tfsa' })],
  ['a-chq', acct('a-chq', { ownership: 'member', member_id: A })],
  ['a-sav', acct('a-sav', { type: 'savings', ownership: 'member', member_id: A })],
  ['b-chq', acct('b-chq', { ownership: 'member', member_id: B })],
])

const run = (pool: TransferRow[], candidateIds?: string[], accounts = ACCOUNTS) =>
  matchTransfers({ candidateIds: new Set(candidateIds ?? pool.map((r) => r.id)), pool, accounts }).pairs

describe('helpers', () => {
  it('isTransferishPfc is prefix based on primary and substring on detailed', () => {
    expect(isTransferishPfc('TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER')).toBe(true)
    expect(isTransferishPfc('TRANSFER_IN', null)).toBe(true)
    expect(isTransferishPfc('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')).toBe(true)
    expect(isTransferishPfc('GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES')).toBe(false)
    expect(isTransferishPfc(null, null)).toBe(false)
  })
  it('pfcVeto only when both legs are classified and neither is a transfer', () => {
    const wages = { pfc_primary: 'INCOME', pfc_detailed: 'INCOME_WAGES' }
    const rent = { pfc_primary: 'RENT_AND_UTILITIES', pfc_detailed: 'RENT_AND_UTILITIES_RENT' }
    const xfer = { pfc_primary: 'TRANSFER_OUT', pfc_detailed: 'TRANSFER_OUT_SAVINGS' }
    const none = { pfc_primary: null, pfc_detailed: null }
    expect(pfcVeto(wages, rent)).toBe(true)
    expect(pfcVeto(wages, xfer)).toBe(false)
    expect(pfcVeto(wages, none)).toBe(false)
    expect(pfcVeto(none, none)).toBe(false)
  })
  it('hasTransferKeyword works on the normalized description', () => {
    expect(hasTransferKeyword('INTERAC E-TRANSFER SENT')).toBe(true)
    expect(hasTransferKeyword('PAYMENT - THANK YOU')).toBe(true)
    expect(hasTransferKeyword('TFR TO 1234')).toBe(true)
    expect(hasTransferKeyword('Online Banking transfer')).toBe(true)
    expect(hasTransferKeyword('TIM HORTONS #4821')).toBe(false)
    expect(hasTransferKeyword(null)).toBe(false)
  })
  it('hintFor prefers Plaid detail, then keywords', () => {
    expect(hintFor({ pfc_detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT', description: 'TFR TO SAVINGS' })).toBe('credit_card')
    expect(hintFor({ pfc_detailed: 'LOAN_PAYMENTS_MORTGAGE_PAYMENT', description: null })).toBe('loan')
    expect(hintFor({ pfc_detailed: 'TRANSFER_OUT_SAVINGS', description: null })).toBe('savings')
    expect(hintFor({ pfc_detailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS', description: null })).toBe('investment')
    expect(hintFor({ pfc_detailed: null, description: 'PAYMENT TO VISA' })).toBe('credit_card')
    expect(hintFor({ pfc_detailed: null, description: 'TFR TO TFSA' })).toBe('investment')
    expect(hintFor({ pfc_detailed: null, description: 'TFR TO SAV 1234' })).toBe('savings')
    expect(hintFor({ pfc_detailed: null, description: 'CAR LOAN PMT' })).toBe('loan')
    expect(hintFor({ pfc_detailed: null, description: 'GROCERIES' })).toBe(null)
  })
  it('hintMatches maps a hint to account types', () => {
    expect(hintMatches('credit_card', 'credit_card')).toBe(true)
    expect(hintMatches('credit_card', 'chequing')).toBe(false)
    expect(hintMatches('investment', 'rrsp')).toBe(true)
    expect(hintMatches('investment', 'savings')).toBe(false)
    expect(hintMatches('savings', 'savings')).toBe(true)
    expect(hintMatches('loan', 'loan')).toBe(true)
    expect(hintMatches(null, 'loan')).toBe(false)
  })
  it('legOwner / transferKind / dayDiff', () => {
    expect(legOwner(acct('x', { ownership: 'member', member_id: A }))).toBe(A)
    expect(legOwner(acct('x'))).toBe(null)
    expect(transferKind('credit_card')).toBe('card_payment')
    expect(transferKind('loan')).toBe('loan_payment')
    expect(transferKind('savings')).toBe('transfer')
    expect(transferKind(null)).toBe('transfer')
    expect(dayDiff('2026-08-20', '2026-08-27')).toBe(7)
    expect(dayDiff('2026-08-31', '2026-09-01')).toBe(1)
    expect(Number.isNaN(dayDiff('2026-08-31', 'nope'))).toBe(true)
  })
})

describe('matchTransfers', () => {
  it('pairs an outflow with the equal-and-opposite inflow and orients by sign', () => {
    const pool = [row('out', 'chq', 100000, '2026-08-10'), row('in', 'visa', -100000, '2026-08-11')]
    expect(run(pool)).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'in' }])
    // Candidate is the inflow: same pair, same orientation.
    expect(run(pool, ['in'])).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'in' }])
  })

  it('never pairs rows on the same account', () => {
    const pool = [row('a', 'chq', 5000, '2026-08-10'), row('b', 'chq', -5000, '2026-08-10')]
    expect(run(pool)).toEqual([])
  })

  it('never pairs amounts that differ or share a sign', () => {
    expect(run([row('a', 'chq', 5000, '2026-08-10'), row('b', 'sav', -5001, '2026-08-10')])).toEqual([])
    expect(run([row('a', 'chq', 5000, '2026-08-10'), row('b', 'sav', 5000, '2026-08-10')])).toEqual([])
  })

  it('uses the 7-day window when there is a signal', () => {
    const at = (d: number) => `2026-08-${String(d).padStart(2, '0')}`
    const withSignal = (d: number) => [
      row('a', 'chq', 20000, at(1), { description: 'PAYMENT TO VISA' }),
      row('b', 'sav', -20000, at(1 + d)),
    ]
    expect(run(withSignal(TRANSFER_WINDOW_DAYS))).toHaveLength(1)
    expect(run(withSignal(TRANSFER_WINDOW_DAYS + 1))).toHaveLength(0)
    // The inflow landing on a card is a signal on its own.
    const toCard = (d: number) => [row('a', 'chq', 20000, at(1)), row('b', 'visa', -20000, at(1 + d))]
    expect(run(toCard(TRANSFER_WINDOW_DAYS))).toHaveLength(1)
    expect(run(toCard(TRANSFER_WINDOW_DAYS + 1))).toHaveLength(0)
  })

  it('uses the bare window when neither leg has a signal', () => {
    const at = (d: number) => `2026-08-${String(d).padStart(2, '0')}`
    const bare = (d: number) => [row('a', 'chq', 20000, at(1)), row('b', 'sav', -20000, at(1 + d))]
    expect(run(bare(BARE_WINDOW_DAYS))).toHaveLength(1)
    expect(run(bare(BARE_WINDOW_DAYS + 1))).toHaveLength(0)
  })

  it('prefers the closest date, breaks ties by id, and is order independent', () => {
    const pool = [
      row('out', 'chq', 30000, '2026-08-10', { description: 'TRANSFER' }),
      row('far', 'sav', -30000, '2026-08-14'),
      row('near', 'sav', -30000, '2026-08-11'),
      row('near2', 'tfsa', -30000, '2026-08-11'),
    ]
    const expected = [{ out_transaction_id: 'out', in_transaction_id: 'near' }]
    expect(run(pool, ['out'])).toEqual(expected)
    expect(run([...pool].reverse(), ['out'])).toEqual(expected)
  })

  it('greedy: weekly transfers pair with their own week, the extra one stays alone', () => {
    const pool = [
      row('o1', 'chq', 20000, '2026-08-03', { description: 'TFR' }),
      row('i1', 'sav', -20000, '2026-08-03'),
      row('o2', 'chq', 20000, '2026-08-07', { description: 'TFR' }),
      row('i2', 'sav', -20000, '2026-08-07'),
      row('o3', 'chq', 20000, '2026-08-08', { description: 'TFR' }),
    ]
    expect(run(pool)).toEqual([
      { out_transaction_id: 'o1', in_transaction_id: 'i1' },
      { out_transaction_id: 'o2', in_transaction_id: 'i2' },
    ])
  })

  it('non-candidate pool rows can be claimed but never pair each other', () => {
    const pool = [
      row('c', 'chq', 1000, '2026-08-10'),
      row('p1', 'sav', -1000, '2026-08-10'),
      row('p2', 'chq', 2000, '2026-08-10'),
      row('p3', 'sav', -2000, '2026-08-10'),
    ]
    expect(run(pool, ['c'])).toEqual([{ out_transaction_id: 'c', in_transaction_id: 'p1' }])
  })

  it('transfer_ignored on either leg blocks the pair', () => {
    expect(run([row('a', 'chq', 1000, '2026-08-10', { transfer_ignored: true }), row('b', 'sav', -1000, '2026-08-10')])).toEqual([])
    expect(run([row('a', 'chq', 1000, '2026-08-10'), row('b', 'sav', -1000, '2026-08-10', { transfer_ignored: true })])).toEqual([])
  })

  it('linked rows are skipped as candidate and as option', () => {
    expect(run([row('a', 'chq', 1000, '2026-08-10', { linked: true }), row('b', 'sav', -1000, '2026-08-10')])).toEqual([])
    expect(run([row('a', 'chq', 1000, '2026-08-10'), row('b', 'sav', -1000, '2026-08-10', { linked: true })])).toEqual([])
  })

  it('zero amounts, unknown accounts and malformed dates never pair', () => {
    expect(run([row('a', 'chq', 0, '2026-08-10'), row('b', 'sav', 0, '2026-08-10')])).toEqual([])
    expect(run([row('a', 'chq', 1000, '2026-08-10'), row('b', 'ghost', -1000, '2026-08-10')])).toEqual([])
    expect(run([row('a', 'chq', 1000, '2026-08-10'), row('b', 'sav', -1000, '10/08/2026')])).toEqual([])
  })

  it('PFC veto: two classified non-transfer rows never pair; one side classified is fine', () => {
    const wages = { pfc_primary: 'INCOME', pfc_detailed: 'INCOME_WAGES' }
    const rent = { pfc_primary: 'RENT_AND_UTILITIES', pfc_detailed: 'RENT_AND_UTILITIES_RENT' }
    expect(run([row('a', 'chq', 200000, '2026-08-01', rent), row('b', 'sav', -200000, '2026-08-01', wages)])).toEqual([])
    expect(run([row('a', 'chq', 200000, '2026-08-01', rent), row('b', 'sav', -200000, '2026-08-01')])).toHaveLength(1)
    expect(
      run([
        row('a', 'chq', 200000, '2026-08-01', { pfc_primary: 'TRANSFER_OUT', pfc_detailed: 'TRANSFER_OUT_SAVINGS' }),
        row('b', 'sav', -200000, '2026-08-01', wages),
      ]),
    ).toHaveLength(1)
    expect(
      run([
        row('a', 'chq', 200000, '2026-08-01', { pfc_primary: 'LOAN_PAYMENTS', pfc_detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }),
        row('b', 'visa', -200000, '2026-08-01', { pfc_primary: 'LOAN_PAYMENTS', pfc_detailed: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }),
      ]),
    ).toHaveLength(1)
  })

  it('settlement precedence: member -> member with a settlement rule is not a transfer', () => {
    const settle = { settlementCandidate: true, description: 'INTERAC E-TRANSFER' }
    // A's personal -> B's personal, e-Transfer rule matched: settlement path owns it.
    expect(run([row('a', 'a-chq', 10000, '2026-08-10', settle), row('b', 'b-chq', -10000, '2026-08-10', settle)])).toEqual([])
    // Same owner: A moving money between two of A's own accounts.
    expect(run([row('a', 'a-chq', 10000, '2026-08-10', settle), row('b', 'a-sav', -10000, '2026-08-10', settle)])).toHaveLength(1)
    // Joint account on one side: a transfer.
    expect(run([row('a', 'a-chq', 10000, '2026-08-10', settle), row('b', 'chq', -10000, '2026-08-10', settle)])).toHaveLength(1)
    // No settlement rule in play: the household chose to pair every account.
    expect(run([row('a', 'a-chq', 10000, '2026-08-10'), row('b', 'b-chq', -10000, '2026-08-10')])).toHaveLength(1)
  })

  it('hint agreement outranks date distance', () => {
    const pool = [
      row('out', 'chq', 50000, '2026-08-10', { pfc_primary: 'TRANSFER_OUT', pfc_detailed: 'TRANSFER_OUT_SAVINGS' }),
      row('card', 'visa', -50000, '2026-08-10'),
      row('sav', 'sav', -50000, '2026-08-11'),
    ]
    expect(run(pool, ['out'])).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'sav' }])

    const pool2 = [
      row('out', 'chq', 50000, '2026-08-10', { description: 'PAYMENT TO VISA' }),
      row('sav', 'sav', -50000, '2026-08-10'),
      row('card', 'visa', -50000, '2026-08-11'),
    ]
    expect(run(pool2, ['out'])).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'card' }])
  })

  it('equal hint and distance: the option with its own signal wins, then asset -> liability shape', () => {
    const pool = [
      row('out', 'chq', 5000, '2026-08-10', { description: 'TRANSFER' }),
      row('plain', 'sav', -5000, '2026-08-10'),
      row('signal', 'tfsa', -5000, '2026-08-10', { description: 'TRANSFER IN' }),
    ]
    expect(run(pool, ['out'])).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'signal' }])

    const pool2 = [
      row('out', 'chq', 5000, '2026-08-10', { description: 'TRANSFER' }),
      row('sav', 'sav', -5000, '2026-08-10'),
      row('card', 'visa', -5000, '2026-08-10'),
    ]
    expect(run(pool2, ['out'])).toEqual([{ out_transaction_id: 'out', in_transaction_id: 'card' }])
  })

  it('pending rows pair like posted rows (no pending flag in the model)', () => {
    const pool = [row('a', 'chq', 1000, '2026-08-10'), row('b', 'sav', -1000, '2026-08-10')]
    expect(run(pool)).toHaveLength(1)
  })
})
