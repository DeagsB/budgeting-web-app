'use client'

import { useActionState } from 'react'
import { formatDate } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { addRateChange, deleteRateChange, type RateChangeState } from './actions'

type RateChange = {
  id: string
  account_id: string
  effective_month: string
  annual_rate_bps: number
  note: string | null
}

export function RateHistory({
  accountId,
  baseRateBps,
  originationDate,
  rateChanges,
}: {
  accountId: string
  baseRateBps: number
  originationDate: string
  rateChanges: RateChange[]
}) {
  const [state, formAction, pending] = useActionState<RateChangeState, FormData>(
    addRateChange,
    undefined,
  )

  return (
    <div className="rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Rate history</MapleLabel>
        <p className="text-[11.5px] text-[var(--color-ink-3)]">
          Starting{' '}
          <span className="font-semibold tabular-nums text-[var(--color-ink-2)]">
            {(baseRateBps / 100).toFixed(3)}%
          </span>{' '}
          since {formatDate(originationDate)}
        </p>
      </div>

      {rateChanges.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
          {rateChanges.map((r, i) => (
            <li
              key={r.id}
              className={
                'flex items-center justify-between px-3 py-2 text-[12.5px] ' +
                (i > 0 ? 'border-t border-[var(--color-hair)]' : '')
              }
            >
              <div className="min-w-0">
                <span className="font-serif text-[14px] tabular-nums text-[var(--color-ink)]">
                  {(r.annual_rate_bps / 100).toFixed(3)}%
                </span>
                <span className="ml-2 text-[11.5px] text-[var(--color-ink-3)]">
                  effective {formatDate(r.effective_month)}
                </span>
                {r.note && (
                  <span className="ml-2 text-[11.5px] text-[var(--color-ink-3)]">· {r.note}</span>
                )}
              </div>
              <ConfirmButton
                action={deleteRateChange}
                formData={{ id: r.id }}
                prompt="Remove this rate change?"
                confirmLabel="Remove"
                destructive
                className="text-[11.5px] font-semibold underline-offset-2 hover:underline"
              >
                <span style={{ color: 'var(--color-maple)' }}>Remove</span>
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-3 grid items-end gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <input type="hidden" name="account_id" value={accountId} />
        <Field label="Effective month">
          <input
            name="effective_month"
            type="date"
            required
            className="maple-input sm"
          />
        </Field>
        <Field label="New rate (%)">
          <input
            name="annual_rate_pct"
            type="text"
            inputMode="decimal"
            required
            placeholder="5.999"
            className="maple-input sm w-24 text-right tabular-nums"
          />
        </Field>
        <Field label="Note (optional)">
          <input
            name="note"
            placeholder="e.g. BoC rate cut"
            maxLength={500}
            className="maple-input sm"
          />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add'}
        </button>
      </form>

      <p className="mt-2 text-[11.5px] text-[var(--color-ink-3)]">
        Pick the first of a month. The rate applies to periods whose month is ≥ the effective month.
      </p>

      {state && 'error' in state && state.error && (
        <p
          className="mt-2 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </p>
      )}
      {state && 'ok' in state && state.ok && (
        <p
          className="mt-2 rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
          style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
        >
          Saved.
        </p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
