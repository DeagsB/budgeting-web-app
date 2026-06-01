'use client'

import { useActionState } from 'react'
import { formatMoney } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { recordSettlement, type SettlementState } from './actions'

type Member = { id: string; name: string }
type Suggestion = {
  from_member_id: string
  to_member_id: string
  net_cents: number
} | null

export function RecordSettlementForm({
  members,
  defaultDate,
  suggestion,
}: {
  members: Member[]
  defaultDate: string
  suggestion: Suggestion
}) {
  const [state, formAction, pending] = useActionState<SettlementState, FormData>(
    recordSettlement,
    undefined,
  )

  const defaultFrom = suggestion?.from_member_id ?? members[0]?.id ?? ''
  const defaultTo =
    suggestion?.to_member_id ?? members.find((m) => m.id !== defaultFrom)?.id ?? ''
  const defaultAmount =
    suggestion?.net_cents != null ? (suggestion.net_cents / 100).toFixed(2) : ''

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="From" span={2}>
          <select name="from_member_id" defaultValue={defaultFrom} className="maple-select">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" span={2}>
          <select name="to_member_id" defaultValue={defaultTo} className="maple-select">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Amount"
          span={2}
          hint={suggestion ? `Outstanding: ${formatMoney(suggestion.net_cents)}` : undefined}
        >
          <div className="flex items-center rounded-md border border-hair bg-paper px-3 py-2.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
            <span className="text-[13px] text-ink-3">$</span>
            <input
              name="amount"
              type="text"
              inputMode="decimal"
              required
              defaultValue={defaultAmount}
              placeholder="0.00"
              className="w-full bg-transparent pl-1 text-[16px] tabular-nums text-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </Field>

        <Field label="Date" span={3}>
          <input
            name="settled_on"
            type="date"
            required
            defaultValue={defaultDate}
            className="maple-input"
          />
        </Field>
        <Field label="Note (optional)" span={3}>
          <input
            name="note"
            maxLength={500}
            placeholder="e.g. April settlement — e-transfer"
            className="maple-input"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3">
        {state && 'error' in state && state.error ? (
          <p className="rounded-sm bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
            {state.error}
          </p>
        ) : state && 'ok' in state && state.ok ? (
          <p className="rounded-sm bg-leaf-soft px-3 py-1.5 text-[12.5px] font-medium text-leaf">
            Payment recorded
          </p>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" disabled={pending} className="shrink-0">
          {pending ? 'Saving…' : 'Record payment'}
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
  span: number
  hint?: string
  children: React.ReactNode
}) {
  const sc = span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : 'sm:col-span-6'
  return (
    <label className={`flex flex-col gap-1 ${sc}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}
