'use client'

import { useActionState, useState } from 'react'
import { ACCOUNT_TYPES } from '@/lib/domain'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { createFirstAccount, type FirstAccountState } from './actions'

export function FirstAccountForm() {
  const [state, formAction, pending] = useActionState<FirstAccountState, FormData>(
    createFirstAccount,
    undefined,
  )
  const [name, setName] = useState('')
  const [cents, setCents] = useState<number | null>(0)

  // The action stays on the step so another account - or another bank - can be
  // added. Clear the fields when a save lands, by adjusting state during the
  // render that first sees the new action result (the type select keeps its
  // value on purpose - the next account is usually the same kind).
  const saved = !!state && 'ok' in state
  const [seen, setSeen] = useState(state)
  if (state !== seen) {
    setSeen(state)
    if (saved) {
      setName('')
      setCents(0)
    }
  }

  const ready = name.trim().length > 0 && cents !== null

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field label="Name">
        <input
          name="name"
          type="text"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chequing"
          className="maple-input"
          autoFocus
        />
      </Field>

      <Field label="Type">
        <select name="type" required className="maple-select" defaultValue={ACCOUNT_TYPES[0].value}>
          {ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Starting balance (CAD)"
        hint="Optional. For a loan or credit card, enter the balance owing as a positive number."
      >
        <div className="flex items-center rounded-[12px] border border-hair bg-paper px-3.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
          <span className="text-[15px] text-ink-3">$</span>
          <MoneyInput
            cents={cents ?? 0}
            onCents={setCents}
            name="opening_balance_cents"
            placeholder="0.00"
            aria-label="Starting balance in dollars"
            className="pl-1"
          />
        </div>
      </Field>

      {state && 'error' in state && (
        <div
          role="alert"
          className="rounded-[12px] bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple"
        >
          {state.error}
        </div>
      )}

      <div className="flex pt-1 sm:justify-end">
        <Button type="submit" variant="secondary" size="md" disabled={pending || !ready} className="w-full sm:w-auto">
          {pending ? 'Adding…' : 'Add account'}
        </Button>
      </div>
    </form>
  )
}
