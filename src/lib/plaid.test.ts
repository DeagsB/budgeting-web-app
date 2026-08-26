import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { decryptToken, encryptToken, plaidAmountToCents } from './plaid'

describe('plaidAmountToCents', () => {
  it('keeps sign: positive Plaid amount (money out) stays positive (outflow)', () => {
    expect(plaidAmountToCents(12.34)).toBe(1234)
  })

  it('negative Plaid amount (deposit/refund) stays negative (inflow)', () => {
    expect(plaidAmountToCents(-250)).toBe(-25000)
  })

  it('rounds half-cents deterministically', () => {
    expect(plaidAmountToCents(0.005)).toBe(1)
    expect(plaidAmountToCents(1.005)).toBe(100) // float artefact: 1.005*100 = 100.49999
    expect(plaidAmountToCents(19.995)).toBe(2000)
  })

  it('handles zero', () => {
    expect(plaidAmountToCents(0)).toBe(0)
  })

  it('throws on non-finite input', () => {
    expect(() => plaidAmountToCents(Number.NaN)).toThrow()
    expect(() => plaidAmountToCents(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('token encryption', () => {
  const original = process.env.PLAID_TOKEN_KEY

  beforeEach(() => {
    process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64')
  })
  afterEach(() => {
    if (original === undefined) delete process.env.PLAID_TOKEN_KEY
    else process.env.PLAID_TOKEN_KEY = original
  })

  it('round-trips', () => {
    const token = 'access-sandbox-' + randomBytes(16).toString('hex')
    expect(decryptToken(encryptToken(token))).toBe(token)
  })

  it('uses a fresh IV per call', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('fails closed when the key changes', () => {
    const blob = encryptToken('secret')
    process.env.PLAID_TOKEN_KEY = randomBytes(32).toString('base64')
    expect(() => decryptToken(blob)).toThrow()
  })

  it('rejects a wrong-length key', () => {
    process.env.PLAID_TOKEN_KEY = randomBytes(16).toString('base64')
    expect(() => encryptToken('x')).toThrow(/32 bytes/)
  })
})
