// Shared domain constants mirroring the Postgres enums from the initial schema.

export const ACCOUNT_TYPES = [
  { value: 'chequing', label: 'Chequing' },
  { value: 'savings', label: 'Savings (non-registered)' },
  { value: 'tfsa', label: 'TFSA' },
  { value: 'rrsp', label: 'RRSP' },
  { value: 'fhsa', label: 'FHSA' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'taxable_investment', label: 'Taxable investment' },
  { value: 'loan', label: 'Loan' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]['value']

const ACCOUNT_TYPE_LABEL = new Map(ACCOUNT_TYPES.map((t) => [t.value, t.label]))
export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABEL.get(type as AccountType) ?? type
}

export const ACCOUNT_OWNERSHIP = [
  { value: 'member', label: 'Member' },
  { value: 'shared', label: 'Shared' },
] as const

export type AccountOwnership = (typeof ACCOUNT_OWNERSHIP)[number]['value']

// Which account types typically represent liabilities (negative net worth
// contribution). Used by the future balance-sheet view.
export const LIABILITY_TYPES: ReadonlySet<AccountType> = new Set([
  'loan',
  'credit_card',
])

// Which account types hold invested balances (tracked month-by-month on the
// workbook's Investment Savings Growth sheets).
export const INVESTMENT_TYPES: ReadonlySet<AccountType> = new Set([
  'tfsa',
  'rrsp',
  'fhsa',
  'crypto',
  'taxable_investment',
])
