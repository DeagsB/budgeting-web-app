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
 * (commas, spaces, a partial "12." etc.); parsing happens on blur so a value
 * like "25" stays "25" until committed instead of being re-rendered as "2.05"
 * on every keystroke. Invalid text is flagged with `aria-invalid` + a red
 * ring and reported upward as `null` so the parent can block submission.
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
        onChange={(e) => setRaw(e.target.value)}
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
