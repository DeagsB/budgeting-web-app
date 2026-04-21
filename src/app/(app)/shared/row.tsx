'use client'

import { useState, useTransition } from 'react'
import { formatMoney } from '@/lib/format'
import { toggleShared, saveShareOverride, clearShares } from './actions'

type Txn = {
  id: string
  occurredLabel: string
  amount_cents: number
  description: string | null
  payer_id: string | null
  payerName: string | null
}

type Member = { id: string; name: string }

export function SharedRow({
  transaction: t,
  members,
  shares,
}: {
  transaction: Txn
  members: Member[]
  shares: { member_id: string; amount_cents: number }[]
}) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const isShared = shares.length > 0

  const color =
    t.amount_cents > 0 ? 'text-red-700' : t.amount_cents < 0 ? 'text-green-700' : 'text-gray-900'
  const sign = t.amount_cents < 0 ? '+' : ''
  const totalAbs = Math.abs(t.amount_cents)

  const shareSum = shares.reduce((s, sh) => s + sh.amount_cents, 0)
  const payerShareCents = totalAbs - shareSum
  const nonPayerMembers = members.filter((m) => m.id !== t.payer_id)
  const amountByMember = new Map(shares.map((s) => [s.member_id, s.amount_cents]))

  return (
    <li className="flex flex-col">
      <div className="flex items-start gap-3 px-4 py-3 text-sm sm:gap-4 sm:px-6">
        <form
          action={(fd) =>
            startTransition(async () => {
              await toggleShared(fd)
            })
          }
          className="shrink-0 pt-0.5"
        >
          <input type="hidden" name="transaction_id" value={t.id} />
          <button
            type="submit"
            disabled={pending}
            aria-label={isShared ? 'Unshare' : 'Share'}
            className={
              'flex h-6 w-6 items-center justify-center rounded border transition-colors ' +
              (isShared
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-300 bg-white hover:border-gray-500')
            }
          >
            {isShared ? '✓' : ''}
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate font-medium text-gray-900">{t.description ?? '—'}</div>
            <div className={`shrink-0 tabular-nums ${color}`}>
              {sign}
              {formatMoney(totalAbs)}
            </div>
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {t.occurredLabel}
            {' · '}
            {t.payerName ? `${t.payerName} paid` : 'Shared account'}
            {isShared && ` · split ${shares.length + (t.payer_id ? 1 : 0)}-way`}
          </div>
          {isShared && (
            <div className="mt-2 flex items-center gap-4 text-xs">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="text-gray-500 hover:text-gray-900"
              >
                {editing ? 'Hide split' : 'Edit split'}
              </button>
              <form
                action={(fd) =>
                  startTransition(async () => {
                    await clearShares(fd)
                  })
                }
              >
                <input type="hidden" name="transaction_id" value={t.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="text-red-600 hover:text-red-800"
                >
                  Clear
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {isShared && editing && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 sm:px-6">
          <SplitEditor
            transactionId={t.id}
            totalAbs={totalAbs}
            payerId={t.payer_id}
            payerName={t.payerName}
            nonPayerMembers={nonPayerMembers}
            amountByMember={amountByMember}
            onClose={() => setEditing(false)}
          />
        </div>
      )}

      {isShared && !editing && (
        <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-2 text-xs text-gray-500 sm:px-6">
          {t.payerName && (
            <>
              <strong className="text-gray-700">{t.payerName}</strong> keeps{' '}
              {formatMoney(payerShareCents)} ·{' '}
            </>
          )}
          {shares.map((s, i) => {
            const name = members.find((m) => m.id === s.member_id)?.name ?? 'Removed'
            return (
              <span key={s.member_id}>
                {i > 0 && ' · '}
                <strong className="text-gray-700">{name}</strong> owes {formatMoney(s.amount_cents)}
              </span>
            )
          })}
        </div>
      )}
    </li>
  )
}

function SplitEditor({
  transactionId,
  totalAbs,
  payerId,
  payerName,
  nonPayerMembers,
  amountByMember,
  onClose,
}: {
  transactionId: string
  totalAbs: number
  payerId: string | null
  payerName: string | null
  nonPayerMembers: Member[]
  amountByMember: Map<string, number>
  onClose: () => void
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {}
    for (const m of nonPayerMembers) seed[m.id] = amountByMember.get(m.id) ?? 0
    return seed
  })
  const [pending, startTransition] = useTransition()

  const sum = Object.values(amounts).reduce((s, v) => s + v, 0)
  const leftover = totalAbs - sum

  function setEqual() {
    const denom = payerId ? nonPayerMembers.length + 1 : nonPayerMembers.length
    if (denom === 0) return
    const base = Math.floor(totalAbs / denom)
    const next: Record<string, number> = {}
    for (const m of nonPayerMembers) next[m.id] = base
    setAmounts(next)
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveShareOverride(fd)
          onClose()
        })
      }
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="transaction_id" value={transactionId} />

      <div className="flex items-baseline justify-between text-xs text-gray-500">
        <span>
          Total{' '}
          <strong className="text-gray-900 tabular-nums">{formatMoney(totalAbs)}</strong>
          {payerName && (
            <>
              {' '}· payer <strong className="text-gray-700">{payerName}</strong> keeps{' '}
              <strong className="tabular-nums text-gray-700">{formatMoney(leftover)}</strong>
            </>
          )}
        </span>
        <button
          type="button"
          onClick={setEqual}
          className="text-xs font-medium text-gray-700 underline hover:text-gray-900"
        >
          Split equally
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {nonPayerMembers.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">{m.name} owes</span>
            <input
              name={`share:${m.id}`}
              type="text"
              inputMode="decimal"
              value={amounts[m.id] === 0 ? '' : (amounts[m.id] / 100).toFixed(2)}
              placeholder="0.00"
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                const n = Number(cleaned)
                const cents = Number.isFinite(n) ? Math.round(n * 100) : 0
                setAmounts((prev) => ({ ...prev, [m.id]: cents }))
              }}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm tabular-nums"
            />
          </label>
        ))}
      </div>

      {sum > totalAbs && (
        <p className="text-sm text-red-600">
          Shares can&apos;t exceed the transaction total ({formatMoney(sum)} &gt;{' '}
          {formatMoney(totalAbs)}).
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || sum > totalAbs}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save split'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
