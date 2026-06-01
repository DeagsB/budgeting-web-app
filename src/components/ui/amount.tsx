import { formatMoney, formatMoneyCompact, formatMoneySigned } from '@/lib/format'

type AmountProps = {
  cents: number | bigint | null | undefined
  sign?: 'auto' | 'always' | 'none'
  tone?: 'ink' | 'up' | 'down' | 'leaf' | 'maple' | 'auto'
  compact?: boolean
  className?: string
}

const TONE_CLASS: Record<'ink' | 'up' | 'down' | 'leaf' | 'maple', string> = {
  ink: 'text-ink',
  up: 'text-up',
  down: 'text-down',
  leaf: 'text-leaf',
  maple: 'text-maple',
}

export function Amount({
  cents,
  sign = 'none',
  tone = 'ink',
  compact = false,
  className = '',
}: AmountProps) {
  const numeric = cents === null || cents === undefined ? null : Number(cents)

  let formatted: string
  if (compact) {
    formatted = formatMoneyCompact(cents)
  } else if (sign === 'always') {
    formatted = formatMoneySigned(cents, { plus: true })
  } else if (sign === 'auto') {
    formatted = formatMoneySigned(cents, { plus: false })
  } else {
    formatted = formatMoney(cents)
  }

  const toneClass =
    tone === 'auto'
      ? numeric !== null && numeric < 0
        ? 'text-down'
        : 'text-ink'
      : TONE_CLASS[tone]

  return (
    <span className={`font-serif tabular-nums ${toneClass} ${className}`}>{formatted}</span>
  )
}
