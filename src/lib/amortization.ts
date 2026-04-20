// Amortisation calculator supporting variable rates. Callers provide either
// a constant annual_rate_bps or a per-period rate function. Each period is
// treated as one month. Operates in integer cents to avoid float drift on
// the principal balance.

export type AmortRow = {
  index: number
  starting_cents: number
  interest_cents: number
  principal_cents: number
  payment_cents: number
  ending_cents: number
  rate_bps: number
}

export type AmortResult = {
  schedule: AmortRow[]
  total_interest_cents: number
  total_payments_cents: number
  months: number
  payoff_month_offset: number
}

type AmortOpts = {
  principal_cents: number
  monthly_payment_cents: number
  max_months?: number
} & ({ annual_rate_bps: number } | { rateForPeriod: (periodIndex1Based: number) => number })

export function amortize(opts: AmortOpts): AmortResult {
  const maxMonths = opts.max_months ?? 600
  const rateFn =
    'rateForPeriod' in opts
      ? opts.rateForPeriod
      : (() => {
          const fixed = opts.annual_rate_bps
          return () => fixed
        })()

  const schedule: AmortRow[] = []
  let balance = opts.principal_cents
  let totalInterest = 0
  let totalPaid = 0
  let i = 0

  while (balance > 0 && i < maxMonths) {
    i += 1
    const rateBps = rateFn(i)
    const monthlyRate = rateBps / 12 / 10_000
    const interest = Math.round(balance * monthlyRate)
    let principal = opts.monthly_payment_cents - interest
    let payment = opts.monthly_payment_cents
    if (principal <= 0) {
      schedule.push({
        index: i,
        starting_cents: balance,
        interest_cents: interest,
        principal_cents: 0,
        payment_cents: payment,
        ending_cents: balance + (interest - payment),
        rate_bps: rateBps,
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
      rate_bps: rateBps,
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

// Given a base rate + ordered list of rate changes, build a rate lookup for
// amortisation periods. `startMonth` is the ISO first-of-month date that
// period 1 represents. `rateChanges` is effective_month (ISO) + rate_bps,
// sorted ascending by effective_month.
export function buildRateLookup({
  baseRateBps,
  startMonth,
  rateChanges,
}: {
  baseRateBps: number
  startMonth: string
  rateChanges: { effective_month: string; annual_rate_bps: number }[]
}): (periodIndex: number) => number {
  return (periodIndex: number) => {
    const periodDate = addMonthsISO(startMonth, periodIndex - 1)
    let rate = baseRateBps
    for (const change of rateChanges) {
      if (change.effective_month <= periodDate) rate = change.annual_rate_bps
      else break
    }
    return rate
  }
}

function addMonthsISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setMonth(d.getMonth() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
