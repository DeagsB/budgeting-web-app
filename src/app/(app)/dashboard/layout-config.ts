// Dashboard widget catalogue + default order. Shared by the dashboard
// client and the (lazily loaded) layout editor.

export const WIDGETS = [
  { id: 'greeting',        label: 'Greeting',        description: 'Month + name + member chips' },
  { id: 'inbox',           label: 'To categorize',   description: 'Uncategorized transactions across every account' },
  { id: 'net-worth',       label: 'Net worth',       description: 'Hero number + chart + range selector' },
  { id: 'month-stats',     label: 'Month stats',     description: 'Income, Spent, Saved tiles' },
  { id: 'budget-left',     label: 'Left to spend',   description: 'Per-category budget remaining, worst first' },
  { id: 'budget-progress', label: 'Budget progress', description: 'This month spent vs budgeted' },
  { id: 'pace',            label: 'Pace',            description: 'Daily spend + projected month-end' },
  { id: 'accounts',        label: 'Accounts',        description: 'Horizontal scroll of flippable cards' },
  { id: 'spending',        label: 'Where it went',   description: 'Top categories breakdown bar' },
  { id: 'recurring',       label: 'Recurring',       description: 'Subscriptions + bills detected from last 3 months' },
  { id: 'goals',           label: 'Goals',           description: 'Progress towards your savings goals' },
  { id: 'recent-activity', label: 'Recent activity', description: 'Latest transactions across all accounts' },
] as const

export type WidgetId = (typeof WIDGETS)[number]['id']

export const DEFAULT_LAYOUT: WidgetId[] = [
  'greeting',
  'inbox',
  'net-worth',
  'month-stats',
  'budget-left',
  'accounts',
  'spending',
]
