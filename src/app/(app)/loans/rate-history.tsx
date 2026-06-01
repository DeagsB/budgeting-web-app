'use client'

import { useActionState } from 'react'
import { formatDate } from '@/lib/format'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
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

  const error = state && 'error' in state ? state.error : null
  const saved = !!state && 'ok' in state && state.ok

  return (
    <div className="rounded-md border border-hair bg-paper-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Rate history</MapleLabel>
        <p className="text-[11.5px] text-ink-3">
          Starting{' '}
          <span className="font-semibold tabular-nums text-ink-2">
            {(baseRateBps / 100).toFixed(3)}%
          </span>{' '}
          since {formatDate(originationDate)}
        </p>
      </div>

      {rateChanges.length > 0 && (
        <ul className="mt-3 overflow-hidden rounded-md border border-hair bg-paper">
          {rateChanges.map((r, i) => (
            <li
              key={r.id}
              className={
                'flex items-center justify-between px-3 py-2 text-[12.5px] ' +
                (i > 0 ? 'border-t border-hair' : '')
              }
            >
              <div className="min-w-0">
                <span className="font-serif text-[14px] tabular-nums text-ink">
                  {(r.annual_rate_bps / 100).toFixed(3)}%
                </span>
                <span className="ml-2 text-[11.5px] text-ink-3">
                  effective {formatDate(r.effective_month)}
                </span>
                {r.note && (
                  <span className="ml-2 text-[11.5px] text-ink-3">· {r.note}</span>
                )}
              </div>
              <ConfirmButton
                action={deleteRateChange}
                formData={{ id: r.id }}
                prompt="Remove this rate change?"
                confirmLabel="Remove"
                destructive
                className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-[11.5px] font-semibold text-maple underline-offset-2 hover:underline"
              >
                Remove
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
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </form>

      <p className="mt-2 text-[11.5px] text-ink-3">
        Pick the first of a month. The rate applies to periods whose month is ≥ the effective month.
      </p>

      <div aria-live="polite">
        {error && (
          <p className="mt-2 inline-block rounded-sm bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
            {error}
          </p>
        )}
        {saved && !pending && (
          <p className="mt-2 inline-block rounded-sm bg-leaf-soft px-3 py-1.5 text-[12.5px] font-medium text-leaf">
            Rate change saved.
          </p>
        )}
      </div>
    </div>
  )
}
