'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
import { Amount } from '@/components/ui/amount'
import { confirmPaymentCandidate, ignorePaymentCandidate } from './actions'

export type PaymentPromptVM = {
  transaction_id: string
  description: string | null
  occurredLabel: string
  /** Signed cents: > 0 the member paid, < 0 they received. */
  amount_cents: number
  memberName: string
  /** True when the signed-in member owns the row (only they can dismiss it). */
  mine: boolean
  suggested_counterparty: string | null
  counterparties: { id: string; name: string }[]
}

/**
 * Ledger rows a settlement rule matched that the app could not place on its
 * own (no outstanding line for exactly this amount). One tap records it
 * with the chosen counterparty; "Not a payment" hides it for good.
 */
export function PaymentPrompts({ prompts }: { prompts: PaymentPromptVM[] }) {
  if (prompts.length === 0) return null
  return (
    <Card padding="none" className="overflow-hidden border-honey">
      <header className="flex items-baseline justify-between gap-3 border-b border-hair px-5 py-3.5">
        <MapleLabel>Payments to confirm</MapleLabel>
        <span className="text-[11px] text-ink-3">Found on the ledger</span>
      </header>
      <ul className="divide-y divide-hair">
        {prompts.map((p) => (
          <PromptRow key={p.transaction_id} p={p} />
        ))}
      </ul>
    </Card>
  )
}

function PromptRow({ p }: { p: PaymentPromptVM }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [counterparty, setCounterparty] = useState(p.suggested_counterparty ?? p.counterparties[0]?.id ?? '')
  const paid = p.amount_cents > 0
  const abs = Math.abs(p.amount_cents)

  function run(action: (fd: FormData) => Promise<{ error: string } | { ok: true } | undefined>, extra?: Record<string, string>) {
    start(async () => {
      const fd = new FormData()
      fd.set('transaction_id', p.transaction_id)
      for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v)
      const res = await action(fd)
      if (res && 'error' in res) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-medium text-ink">{p.description ?? '-'}</div>
          <div className="mt-0.5 text-[12px] text-ink-3">
            {p.occurredLabel} · {p.memberName} {paid ? 'paid' : 'received'}
          </div>
        </div>
        <Amount cents={abs} tone={paid ? 'maple' : 'leaf'} className="shrink-0 text-[16px]" />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-[13px] text-ink-2">
          <span className="shrink-0">{paid ? 'Paid to' : 'Received from'}</span>
          {p.counterparties.length === 1 ? (
            <strong className="font-semibold text-ink">{p.counterparties[0].name}</strong>
          ) : (
            <select
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              aria-label="Counterparty"
              className="maple-select sm min-w-0 flex-1"
            >
              {p.counterparties.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending || !counterparty}
            onClick={() => run(confirmPaymentCandidate, { counterparty_member_id: counterparty })}
          >
            {pending ? 'Saving…' : 'Yes, a payment'}
          </Button>
          {p.mine && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(ignorePaymentCandidate)}>
              Not a payment
            </Button>
          )}
        </div>
      </div>
      {error && <p className="text-[12.5px] font-medium text-maple">{error}</p>}
    </li>
  )
}
