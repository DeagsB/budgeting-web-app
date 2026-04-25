'use client'

import { useActionState, useRef, useState, useEffect } from 'react'
import { createTransaction, type TransactionState } from './actions'
import { CategorySelect } from './category-select'

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
}: {
  defaultDate: string
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: { id: string; name: string }[]
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
    }
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-4">
      {/* Direction + amount hero */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex rounded-full bg-[var(--color-paper-2)] p-1 sm:w-auto">
          <input type="hidden" name="direction" value={direction} />
          <SegmentButton active={direction === 'out'} onClick={() => setDirection('out')}>
            Spent
          </SegmentButton>
          <SegmentButton active={direction === 'in'} onClick={() => setDirection('in')}>
            Received
          </SegmentButton>
        </div>

        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-4 py-2.5 transition-colors focus-within:border-[var(--color-leaf)] focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
          <span className="text-[20px] font-serif text-[var(--color-ink-3)]">$</span>
          <input
            name="amount"
            type="text"
            inputMode="decimal"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            className="w-full bg-transparent font-serif text-[26px] tabular-nums tracking-[-0.01em] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
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
          <select name="member_id" className="maple-select">
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

      {state?.error && (
        <div
          role="alert"
          className="rounded-[12px] px-3 py-2 text-[13px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[13px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add transaction'}
          {!pending && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
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
      className={
        'flex-1 rounded-full px-4 py-2 text-center text-[12.5px] font-semibold transition-all ' +
        (active
          ? 'bg-[var(--color-paper)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
          : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]')
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
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
