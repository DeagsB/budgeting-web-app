'use client'

/**
 * iOS-style segmented single-select. A pill track holds one button per option;
 * the active option lifts onto a `paper` surface with a card shadow. Used for
 * binary/short toggles (transactions Spent/Received, budgets, contributions,
 * time-off). Generic over the option value type `T`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  ariaLabel,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-full bg-cream-2 p-1 gap-1 ${className}`}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={selected}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-[36px] rounded-full px-4 text-[13px] font-semibold transition-colors ${
              selected
                ? 'bg-paper text-ink shadow-[var(--shadow-card)]'
                : 'text-ink-2 hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
