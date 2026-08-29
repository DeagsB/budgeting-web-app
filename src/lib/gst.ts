/**
 * GST/HST split math.
 *
 * A Canadian receipt total is tax-inclusive: the tax is already folded into
 * `totalCents`, not added on top of it. Extracting the tax portion is the
 * inverse of "add `ratePercent`% on top", i.e.
 *
 *   tax = total * rate / (100 + rate)
 *
 * At the standard 5% GST rate that is `total * 5 / 105`.
 */
export function gstIncludedInTotal(totalCents: number, ratePercent: number): number {
  return Math.round((totalCents * ratePercent) / (100 + ratePercent))
}
