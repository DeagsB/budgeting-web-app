'use client'

import { useActionState, useRef, useState, useEffect } from 'react'
import { createAccount, type AccountState } from './actions'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP } from '@/lib/domain'
import { Button } from '@/components/ui/button'

/**
 * Maple "add account" form. Two-row grid: identity (name + type) on top,
 * ownership (shared vs member) + member selector + opening balance below.
 */
export function AddAccountForm({ members }: { members: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(createAccount, undefined)
  const formRef = useRef<HTMLFormElement>(null)
  const [ownership, setOwnership] = useState<'member' | 'shared'>(
    members.length > 0 ? 'member' : 'shared',
  )

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-4 flex flex-col gap-4">
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

        <Field label="Ownership">
          <select
            name="ownership"
            value={ownership}
            onChange={(e) => setOwnership(e.target.value as 'member' | 'shared')}
            className="maple-select"
          >
            {ACCOUNT_OWNERSHIP.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Member">
          <select
            name="member_id"
            disabled={ownership === 'shared'}
            className="maple-select disabled:cursor-not-allowed disabled:bg-paper-2 disabled:text-ink-3"
          >
            {ownership === 'shared' ? (
              <option value="">— Shared —</option>
            ) : (
              <>
                {members.length === 0 && <option value="">(no members)</option>}
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </>
            )}
          </select>
        </Field>

        <Field label="Opening balance (CAD)" hint="For loans or credit cards, enter the balance owing as a positive number.">
          <div className="flex items-center rounded-md border border-hair bg-paper px-3 py-2.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
            <span className="text-[14px] text-ink-3">$</span>
            <input
              name="opening_balance"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue="0.00"
              aria-label="Opening balance in dollars"
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
            className="maple-input tabular-nums"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div aria-live="polite" className="min-w-0">
          {state?.error ? (
            <p className="rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
              {state.error}
            </p>
          ) : (
            <span />
          )}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add account'}
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  span,
  hint,
  children,
}: {
  label: string
  span?: number
  hint?: string
  children: React.ReactNode
}) {
  const sc = span === 2 ? 'sm:col-span-2' : ''
  return (
    <label className={`flex flex-col gap-1 ${sc}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11.5px] text-ink-3">{hint}</span>}
    </label>
  )
}
