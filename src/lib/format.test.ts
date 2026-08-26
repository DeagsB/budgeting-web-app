import { describe, expect, it } from 'vitest'
import { parseDecimal, parseMoneyToCents } from './format'

describe('parseDecimal', () => {
  it('parses hours with either decimal convention', () => {
    expect(parseDecimal('7.5')).toBe(7.5)
    expect(parseDecimal('7,5')).toBe(7.5)
    expect(parseDecimal('1 234,5')).toBe(1234.5)
    expect(parseDecimal('-2')).toBe(-2)
    expect(parseDecimal('1.2345')).toBe(1.23)
  })

  it('rejects empty and malformed input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('-')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
    expect(parseDecimal('1.2.3')).toBeNull()
  })
})

describe('parseMoneyToCents', () => {
  it('parses plain and formatted en-CA amounts', () => {
    expect(parseMoneyToCents('1,234.56')).toBe(123456)
    expect(parseMoneyToCents('$12')).toBe(1200)
    expect(parseMoneyToCents('12.5')).toBe(1250)
    expect(parseMoneyToCents('-5')).toBe(-500)
    expect(parseMoneyToCents(' 7 ')).toBe(700)
    expect(parseMoneyToCents('0')).toBe(0)
    expect(parseMoneyToCents('.5')).toBe(50)
    expect(parseMoneyToCents('12.')).toBe(1200)
    expect(parseMoneyToCents('-$1,000.00')).toBe(-100000)
  })

  it('treats a trailing comma followed by 1-2 digits as the decimal mark (fr-CA)', () => {
    expect(parseMoneyToCents('1 234,56')).toBe(123456)
    expect(parseMoneyToCents('12,5')).toBe(1250)
    expect(parseMoneyToCents('1 234,56')).toBe(123456) // NBSP
    expect(parseMoneyToCents('1 234,56')).toBe(123456) // narrow NBSP
    expect(parseMoneyToCents('-12,50')).toBe(-1250)
  })

  it('treats commas followed by 3 digits as thousands separators', () => {
    expect(parseMoneyToCents('1,234')).toBe(123400)
    expect(parseMoneyToCents('1 234')).toBe(123400)
    expect(parseMoneyToCents('1,234,567')).toBe(123456700)
  })

  it('drops commas when a period is also present', () => {
    expect(parseMoneyToCents('1,234.5')).toBe(123450)
  })

  it('rejects empty, sign-only, and dot-only input', () => {
    expect(parseMoneyToCents('')).toBeNull()
    expect(parseMoneyToCents('   ')).toBeNull()
    expect(parseMoneyToCents('-')).toBeNull()
    expect(parseMoneyToCents('.')).toBeNull()
    expect(parseMoneyToCents('$')).toBeNull()
  })

  it('rejects malformed numbers instead of guessing', () => {
    expect(parseMoneyToCents('1.2.3')).toBeNull()
    expect(parseMoneyToCents('12.345')).toBeNull()
    expect(parseMoneyToCents('abc')).toBeNull()
    expect(parseMoneyToCents('12abc')).toBeNull()
    expect(parseMoneyToCents('1e5')).toBeNull()
    expect(parseMoneyToCents('--5')).toBeNull()
    expect(parseMoneyToCents('5-')).toBeNull()
  })
})
