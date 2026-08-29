import { describe, expect, it } from 'vitest'
import { gstIncludedInTotal } from './gst'

describe('gstIncludedInTotal', () => {
  it('extracts the tax already folded into a tax-inclusive total', () => {
    // $10.50 total at 5% GST -> exactly $0.50 tax.
    expect(gstIncludedInTotal(1050, 5)).toBe(50)
    // $21.00 total at 5% GST -> exactly $1.00 tax.
    expect(gstIncludedInTotal(2100, 5)).toBe(100)
    // $113.00 total at 13% HST -> exactly $13.00 tax.
    expect(gstIncludedInTotal(11300, 13)).toBe(1300)
  })

  it('rounds to the nearest cent when the split is not exact', () => {
    // $100.00 total at 5% -> 476.190... cents.
    expect(gstIncludedInTotal(10000, 5)).toBe(476)
    // $3.33 total at 5% -> 15.857... cents.
    expect(gstIncludedInTotal(333, 5)).toBe(16)
  })

  it('returns zero for a zero total', () => {
    expect(gstIncludedInTotal(0, 5)).toBe(0)
  })

  it('handles a negative total (a refund / inflow) symmetrically', () => {
    expect(gstIncludedInTotal(-1050, 5)).toBe(-50)
    expect(gstIncludedInTotal(-333, 5)).toBe(-16)
  })
})
