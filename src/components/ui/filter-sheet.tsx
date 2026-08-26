'use client'

import type { ReactNode } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'

/**
 * Bottom-sheet filter panel. The caller owns a draft of the filter values and
 * renders the controls as children (see `FilterSection` / `FilterRadioRow`);
 * the sheet supplies the frame plus a "Clear all" / "Show results" footer.
 */
export function FilterSheet({
  open,
  onClose,
  onApply,
  onClear,
  title = 'Filters',
  applyLabel = 'Show results',
  children,
}: {
  open: boolean
  onClose: () => void
  onApply: () => void
  onClear?: () => void
  title?: string
  applyLabel?: string
  children: ReactNode
}) {
  const footer = (
    <div className="flex items-center justify-between gap-3">
      {onClear ? (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="-ml-4">
          Clear all
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" variant="primary" size="md" onClick={onApply}>
        {applyLabel}
      </Button>
    </div>
  )

  return (
    <Sheet open={open} onClose={onClose} title={title} footer={footer}>
      <div className="flex flex-col gap-5 pb-1">{children}</div>
    </Sheet>
  )
}

export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <MapleLabel>{label}</MapleLabel>
      {children}
    </section>
  )
}

/**
 * 44px radio row for single-select lists inside a `FilterSheet`. Native radio
 * input (visually hidden) keeps keyboard + screen-reader semantics for free.
 */
export function FilterRadioRow({
  name,
  value,
  checked,
  onSelect,
  children,
}: {
  name: string
  value: string
  checked: boolean
  onSelect: (value: string) => void
  children: ReactNode
}) {
  return (
    <label
      className={
        'flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md px-3 text-[15px] transition-colors ' +
        (checked ? 'bg-paper font-semibold text-ink shadow-[var(--shadow-card)]' : 'text-ink-2 hover:bg-paper-2')
      }
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="min-w-0 truncate">{children}</span>
      {checked && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-leaf">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </label>
  )
}
