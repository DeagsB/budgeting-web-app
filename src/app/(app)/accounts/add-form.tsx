'use client'

import { useActionState, useRef, useState, useEffect } from 'react'
import { createAccount, type AccountState } from './actions'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP } from '@/lib/domain'
import { Button } from '@/components/ui/button'
import { SheetActions } from '@/components/ui/sheet'

/**
 * Maple "add account" form for manual accounts (cash, or a bank Maple cannot
 * link). Two-row grid: identity (name + type) on top, ownership (mine vs
 * joint) + opening balance below. A "Mine" account belongs to the signed-in
 * member; the server stamps the owner, so there is no picker. Lives inside
 * the `AddAccountSheet` bottom sheet; `onSaved` closes it after a successful
 * submit.
 */
export function AddAccountForm({
  canOwn,
  onSaved,
}: {
  /** False until this login has claimed a member. */
  canOwn: boolean
  onSaved?: () => void
}) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(createAccount, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const [ownership, setOwnership] = useState<'member' | 'shared'>(canOwn ? 'member' : 'shared')

  // Reset + close only after a submit completes without an error. The
  // `wasPending` guard keeps the mount render (pending=false, no state) from
  // firing `onSaved` before the user has typed anything.
  const wasPending = useRef(false)
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset()
      onSaved?.()
    }
    wasPending.current = pending
    // `onSaved` is stable from the caller; depend only on the action outcome.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder="e.g. Chequing"
            className="maple-input"
          />
        </Field>
        <Field label="Type">
          <select name="type" required className="maple-select">
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Ownership"
          hint={
            ownership === 'shared'
              ? 'Joint accounts are visible to everyone in the household.'
              : 'Only you see this account. Share individual transactions from the list.'
          }
        >
          <select
            name="ownership"
            value={ownership}
            onChange={(e) => setOwnership(e.target.value as 'member' | 'shared')}
            className="maple-select"
          >
            {ACCOUNT_OWNERSHIP.filter((o) => canOwn || o.value === 'shared').map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Opening balance (CAD)"
          hint="For loans or credit cards, enter the balance owing as a positive number."
          error={state?.error}
        >
          <div className="flex items-center rounded-md border border-hair bg-paper px-3 py-2.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
            <span className="text-[14px] text-ink-3">$</span>
            <input
              name="opening_balance"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue="0.00"
              aria-label="Opening balance in dollars"
              aria-invalid={state?.error ? true : undefined}
              className="w-full bg-transparent pl-1 text-[15px] tabular-nums text-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </Field>

        <Field label="Last 4 digits (optional)" hint="Card or account suffix. Used to auto-route email-imported transactions to the right account.">
          <input
            name="last_four"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="1234"
            enterKeyHint="done"
            className="maple-input tabular-nums"
          />
        </Field>
      </div>

      {/* Sticky footer inside the sheet: the primary button stays above the
          on-screen keyboard while the fields scroll. */}
      <SheetActions>
        <Button type="submit" variant="primary" size="sm" className="w-full" disabled={pending}>
          {pending ? 'Adding…' : 'Add account'}
        </Button>
      </SheetActions>
    </form>
  )
}

function Field({
  label,
  span,
  hint,
  error,
  children,
}: {
  label: string
  span?: number
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  const sc = span === 2 ? 'sm:col-span-2' : ''
  return (
    <label className={`flex flex-col gap-1 ${sc}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-[11.5px] font-medium text-maple">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[11.5px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}
