'use client'

import { useActionState, useRef, useState, useEffect } from 'react'
import { createTransaction, type TransactionState } from './actions'
import { CategorySelect } from './category-select'
import { Button } from '@/components/ui/button'

/**
 * Maple "add transaction" inline form.
 *
 * Hero: amount + direction segmented toggle (Spent / Received) — the two
 * most common interactions. Everything else collapses into a tight grid below.
 * Submit is a pill button; errors render as a maple-soft banner.
 */
export function AddTransactionForm({
  accounts,
  categories,
  members,
  defaultMemberId = null,
  onSaved,
}: {
  defaultDate: string
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: { id: string; name: string }[]
  /** Preselect the signed-in member as payer. */
  defaultMemberId?: string | null
  onSaved?: () => void
}) {
  const [state, formAction, pending] = useActionState<TransactionState, FormData>(
    createTransaction,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [amount, setAmount] = useState('')

  useEffect(() => {
    if (!pending && !state?.error && state !== undefined) {
      formRef.current?.reset()
      // Resetting local state after a successful server action is the
      // canonical post-submit flow; the alternative (keying the inputs) is
      // more disruptive to the visible controls. Safe here because the
      // effect only fires on state transitions, not on every render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmount('')
      setDirection('out')
      onSaved?.()
    }
  }, [pending, state, onSaved])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {/* Direction + amount hero */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex rounded-full bg-paper-2 p-1 sm:w-auto" role="group" aria-label="Transaction direction">
          <input type="hidden" name="direction" value={direction} />
          <SegmentButton active={direction === 'out'} onClick={() => setDirection('out')}>
            Spent
          </SegmentButton>
          <SegmentButton active={direction === 'in'} onClick={() => setDirection('in')}>
            Received
          </SegmentButton>
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-hair bg-paper px-4 py-2.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
          <span className="text-[20px] font-serif text-ink-3">$</span>
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label={`Amount ${direction === 'out' ? 'spent' : 'received'} in dollars`}
            className="w-full bg-transparent font-serif text-[26px] tabular-nums tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
      </div>

      {/* Fields grid */}
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Date" span={2}>
          <input name="occurred_on" type="date" required defaultValue={todayISO} className="maple-input" />
        </Field>

        <Field label="Account" span={2}>
          <select name="account_id" required className="maple-select">
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Member" span={2}>
          <select name="member_id" className="maple-select" defaultValue={defaultMemberId ?? ''}>
            <option value="">Shared</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" span={3}>
          <CategorySelect name="category_id" categories={categories} />
        </Field>

        <Field label="Description" span={3}>
          <input
            name="description"
            type="text"
            maxLength={500}
            placeholder="Optional"
            className="maple-input"
          />
        </Field>
      </div>

      <div aria-live="polite">
        {state?.error && (
          <div
            role="alert"
            className="rounded-md bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple"
          >
            {state.error}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Saving…' : 'Add transaction'}
          {!pending && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </Button>
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  // flex-1 makes both segments share the pill's width evenly, so the active
  // background actually fills its half instead of hugging the label text.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex-1 rounded-full px-4 py-2 text-center text-[12.5px] font-semibold transition-all ' +
        (active
          ? 'bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
          : 'text-ink-2 hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

function Field({
  label,
  span,
  children,
}: {
  label: string
  span: number
  children: React.ReactNode
}) {
  const spanClass =
    span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : span === 4 ? 'sm:col-span-4' : 'sm:col-span-6'
  return (
    <label className={`flex flex-col gap-1 ${spanClass}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}
