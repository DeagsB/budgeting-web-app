import { describe, expect, it } from 'vitest'
import { transferMeta, transferNoun } from './transfer-label'

describe('transferMeta', () => {
  it('names a card payment from either leg', () => {
    expect(transferMeta({ side: 'out', counterpartName: 'Visa', inAccountType: 'credit_card' })).toEqual({
      kind: 'card_payment',
      noun: 'Card payment',
      label: 'Card payment to Visa',
    })
    expect(transferMeta({ side: 'in', counterpartName: 'Chequing', inAccountType: 'credit_card' })).toEqual({
      kind: 'card_payment',
      noun: 'Card payment',
      label: 'Card payment from Chequing',
    })
  })

  it('names a loan payment', () => {
    expect(transferMeta({ side: 'out', counterpartName: 'Car loan', inAccountType: 'loan' }).label).toBe('Loan payment to Car loan')
    expect(transferMeta({ side: 'in', counterpartName: 'Chequing', inAccountType: 'loan' }).label).toBe('Loan payment from Chequing')
  })

  it('names a plain transfer', () => {
    expect(transferMeta({ side: 'out', counterpartName: 'Savings', inAccountType: 'savings' }).label).toBe('Transfer to Savings')
    expect(transferMeta({ side: 'in', counterpartName: 'Chequing', inAccountType: 'tfsa' }).label).toBe('Transfer from Chequing')
  })

  it('falls back to the bare noun when the counterpart is not visible', () => {
    expect(transferMeta({ side: 'out', counterpartName: null, inAccountType: 'credit_card' })).toEqual({
      kind: 'card_payment',
      noun: 'Card payment',
      label: 'Card payment',
    })
    expect(transferMeta({ side: 'in', counterpartName: null, inAccountType: null })).toEqual({
      kind: 'transfer',
      noun: 'Transfer',
      label: 'Transfer',
    })
  })

  it('transferNoun', () => {
    expect(transferNoun('transfer')).toBe('Transfer')
    expect(transferNoun('card_payment')).toBe('Card payment')
    expect(transferNoun('loan_payment')).toBe('Loan payment')
  })
})
