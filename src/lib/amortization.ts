// Standard fixed-payment amortization calculator. Operates in cents to avoid
// floating-point drift on the stored principal; intermediate math uses JS
// numbers (safe for loan sizes well within Number.MAX_SAFE_INTEGER).
//
// If the contractual payment is less than one month's interest the loan never
// amortises — the caller should treat that as a configuration error.

export type AmortRow = {
  index: number // 1-based
  starting_cents: number
  interest_cents: number
  principal_cents: number
  payment_cents: number
  ending_cents: number
}

export type AmortResult = {
  schedule: AmortRow[]
  total_interest_cents: number
  total_payments_cents: number
  months: number
  payoff_month_offset: number // 0 = this month
}

export function amortize({
  principal_cents,
  annual_rate_bps,
  monthly_payment_cents,
  max_months = 600,
}: {
  principal_cents: number
  annual_rate_bps: number
  monthly_payment_cents: number
  max_months?: number
}): AmortResult {
  const monthlyRate = annual_rate_bps / 12 / 10_000
  const schedule: AmortRow[] = []
  let balance = principal_cents
  let totalInterest = 0
  let totalPaid = 0
  let i = 0

  while (balance > 0 && i < max_months) {
    i += 1
    const interest = Math.round(balance * monthlyRate)
    let principal = monthly_payment_cents - interest
    let payment = monthly_payment_cents
    if (principal <= 0) {
      // Payment doesn't cover interest; stop to avoid infinite loop.
      schedule.push({
        index: i,
        starting_cents: balance,
        interest_cents: interest,
        principal_cents: 0,
        payment_cents: payment,
        ending_cents: balance + (interest - payment),
      })
      totalInterest += interest
      totalPaid += payment
      break
    }
    if (principal > balance) {
      principal = balance
      payment = principal + interest
    }
    const ending = balance - principal
    schedule.push({
      index: i,
      starting_cents: balance,
      interest_cents: interest,
      principal_cents: principal,
      payment_cents: payment,
      ending_cents: ending,
    })
    totalInterest += interest
    totalPaid += payment
    balance = ending
  }

  return {
    schedule,
    total_interest_cents: totalInterest,
    total_payments_cents: totalPaid,
    months: i,
    payoff_month_offset: i,
  }
}
