// Maple-aligned category palette. CSS-var entries flip in dark mode; raw
// hex values are tuned to read against both light cream and dark paper
// without per-mode re-tinting. Anything not in the map falls back to
// `var(--color-ink-2)` which is a warm neutral.
const CATEGORY_COLORS: Record<string, string> = {
  Housing:                'var(--color-leaf)',
  Transportation:         'var(--color-honey)',
  Food:                   'var(--color-maple)',
  Health:                 '#3F8B5C',
  Personal:               'var(--color-berry)',
  Subscriptions:          '#7A8B9C',
  Entertainment:          '#B85A8A',
  'Savings contribution': 'var(--color-leaf-deep)',
  Taxes:                  '#5D4E37',
  'Debt payment':         '#8B2A1C',
  Miscellaneous:          'var(--color-ink-3)',
}

export function colorForCategory(name: string): string {
  return CATEGORY_COLORS[name] ?? 'var(--color-ink-2)'
}
