'use client'

import { useEffect, useRef, useState } from 'react'
import { parseMoneyToCents } from '@/lib/format'

export type MoneyInputProps = {
  /** Current value in integer cents. */
  cents: number
  /**
   * Called on blur with the parsed value, or `null` when the typed text is
   * not a valid amount (the raw text is kept so the user can correct it).
   */
  onCents: (cents: number | null) => void
  /** When set, a hidden input posts the cents value under this name. */
  name?: string
  id?: string
  placeholder?: string
  'aria-label'?: string
  'aria-describedby'?: string
  allowNegative?: boolean
  className?: string
  size?: 'sm' | 'md'
  disabled?: boolean
}

function toRaw(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2)
}

/**
 * A free-typing money field. The user may type anything while focused
 * (commas, spaces, a partial "12." etc.) - the displayed text is never
 * reformatted mid-edit, so a value like "25" stays "25" instead of being
 * re-rendered as "2.05" on every keystroke. Parsing still runs on every
 * keystroke that already reads as a valid amount, so callers relying on
 * `cents` (a running total, a "Balanced" badge, an "Apply remainder"
 * shortcut) see live values instead of stale ones from the last blur.
 * `aria-invalid` + the red ring are reserved for blur/submit: a value that
 * doesn't parse *yet* (e.g. a bare "-" or a trailing ".") is never flagged
 * while the user is still typing it, only once they leave the field or try
 * to submit with it unfinished.
 */
export function MoneyInput({
  cents,
  onCents,
  name,
  id,
  placeholder = '0.00',
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  allowNegative = false,
  className = '',
  size = 'md',
  disabled,
}: MoneyInputProps) {
  const [raw, setRaw] = useState(() => toRaw(cents))
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  // Sync from props (e.g. "Split equally" / "Apply remainder") only while the
  // user is not typing in this field.
  useEffect(() => {
    if (!focused.current) {
      setRaw(toRaw(cents))
      setInvalid(false)
    }
  }, [cents])

  function commit(text: string) {
    const parsed = parseMoneyToCents(text)
    const ok = parsed !== null && (allowNegative || parsed >= 0)
    if (ok) {
      setRaw(toRaw(parsed))
      setInvalid(false)
      onCents(parsed)
    } else if (text.trim() === '') {
      // Empty is a deliberate zero, not an error.
      setRaw('')
      setInvalid(false)
      onCents(0)
    } else {
      setInvalid(true)
      onCents(null)
    }
  }

  const sizeClass =
    size === 'sm'
      ? 'min-h-[44px] sm:min-h-[36px] text-[16px] sm:text-[13px]'
      : 'min-h-[44px] text-[16px] sm:text-[15px]'

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        value={raw}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(e) => {
          const text = e.target.value
          setRaw(text)
          // Never flag invalid while typing - only clear an existing flag,
          // so a value that now reads as valid loses its red ring
          // immediately instead of waiting for blur.
          setInvalid(false)
          const parsed = parseMoneyToCents(text)
          const ok = parsed !== null && (allowNegative || parsed >= 0)
          if (ok) {
            onCents(parsed)
          } else if (text.trim() === '') {
            // Empty is a deliberate zero, not (yet) an error.
            onCents(0)
          }
          // Otherwise the text doesn't parse yet (e.g. a bare "-" or ".") -
          // keep the last committed `cents` and wait for blur.
        }}
        onBlur={(e) => {
          focused.current = false
          commit(e.target.value)
        }}
        className={`w-full rounded-sm bg-transparent text-right font-serif tabular-nums text-ink outline-none placeholder:text-ink-3 ${sizeClass} ${
          invalid ? 'ring-2 ring-maple' : ''
        } ${className}`}
      />
      {name && <input type="hidden" name={name} value={invalid ? '' : String(cents)} />}
    </>
  )
}
