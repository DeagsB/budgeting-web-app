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

  // Positive amount = expense (outflow). Sign in the list follows the Maple
  // convention on transactions.
  const isExpense = t.amount_cents > 0
  const amountColor = isExpense ? 'var(--color-ink)' : 'var(--color-leaf)'
  const sign = t.amount_cents < 0 ? '+' : ''
  const totalAbs = Math.abs(t.amount_cents)

  const shareSum = shares.reduce((s, sh) => s + sh.amount_cents, 0)
  const payerShareCents = totalAbs - shareSum
  const nonPayerMembers = members.filter((m) => m.id !== t.payer_id)
  const amountByMember = new Map(shares.map((s) => [s.member_id, s.amount_cents]))
  const splitCount = shares.length + (t.payer_id ? 1 : 0)

  return (
    <li className="flex flex-col">
      <div className="flex items-start gap-3 px-5 py-4 text-[14px] sm:gap-4">
        {/* Maple-branded tick checkbox */}
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
              'flex h-6 w-6 items-center justify-center rounded-[7px] border transition-all active:scale-90 ' +
              (isShared
                ? 'border-[var(--color-leaf)] bg-[var(--color-leaf)] text-white shadow-[0_1px_3px_rgba(24,98,56,0.25)]'
                : 'border-[var(--color-hair)] bg-[var(--color-paper)] hover:border-[var(--color-ink-3)]')
            }
          >
            {isShared && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate font-medium text-[var(--color-ink)]">
              {t.description ?? '—'}
            </div>
            <div
              className="shrink-0 font-serif text-[16px] tabular-nums tracking-[-0.01em]"
              style={{ color: amountColor }}
            >
              {sign}
              {formatMoney(totalAbs)}
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-[var(--color-ink-3)]">
            <span>{t.occurredLabel}</span>
            <span>·</span>
            <span>{t.payerName ? `${t.payerName} paid` : 'Shared account'}</span>
            {isShared && (
              <>
                <span>·</span>
                <span
                  className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
                  style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
                >
                  Split {splitCount}-way
                </span>
              </>
            )}
          </div>
          {isShared && (
            <div className="mt-2 flex items-center gap-3 text-[12px]">
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
              >
                {editing ? 'Hide split' : 'Edit split'}
              </button>
              <span className="text-[var(--color-ink-3)]">·</span>
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
                  className="font-semibold transition-colors hover:underline"
                  style={{ color: 'var(--color-maple)' }}
                >
                  Clear
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {isShared && editing && (
        <div className="border-t border-[var(--color-hair)] bg-[var(--color-cream-2)] px-5 py-5">
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--color-hair)] bg-[var(--color-cream-2)]/60 px-5 py-2.5 text-[11.5px] text-[var(--color-ink-2)]">
          {t.payerName && (
            <span>
              <strong className="font-semibold text-[var(--color-ink)]">{t.payerName}</strong> keeps{' '}
              <span className="tabular-nums text-[var(--color-ink)]">{formatMoney(payerShareCents)}</span>
            </span>
          )}
          {shares.map((s) => {
            const name = members.find((m) => m.id === s.member_id)?.name ?? 'Removed'
            return (
              <span key={s.member_id} className="inline-flex items-center gap-1">
                <span className="text-[var(--color-ink-3)]">·</span>
                <strong className="font-semibold text-[var(--color-ink)]">{name}</strong>{' '}
                <span>owes</span>
                <span className="tabular-nums text-[var(--color-ink)]">{formatMoney(s.amount_cents)}</span>
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
  const overshoot = sum > totalAbs
  const progress = totalAbs === 0 ? 0 : Math.min(1, sum / totalAbs)

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
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="transaction_id" value={transactionId} />

      {/* Header + equal-split action */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Split editor
          </div>
          <div className="mt-0.5 font-serif text-[18px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
            Total <span className="tabular-nums">{formatMoney(totalAbs)}</span>
          </div>
          {payerName && (
            <div className="mt-0.5 text-[12px] text-[var(--color-ink-2)]">
              <strong className="font-semibold text-[var(--color-ink)]">{payerName}</strong> keeps{' '}
              <span className="tabular-nums text-[var(--color-ink)]">{formatMoney(leftover)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={setEqual}
          className="shrink-0 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-cream)]"
        >
          Split equally
        </button>
      </div>

      {/* Progress bar toward total */}
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-paper)]">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.round(progress * 100)}%`,
            background: overshoot ? 'var(--color-maple)' : 'var(--color-leaf)',
          }}
        />
      </div>

      {/* Share inputs */}
      <div className="grid gap-2 sm:grid-cols-2">
        {nonPayerMembers.map((m) => {
          const cents = amounts[m.id] ?? 0
          return (
            <label
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-2.5 text-[13.5px] transition-colors focus-within:border-[var(--color-leaf)]"
            >
              <span className="min-w-0 truncate text-[var(--color-ink)]">
                {m.name} <span className="text-[var(--color-ink-3)]">owes</span>
              </span>
              <div className="flex items-center">
                <span className="text-[12px] text-[var(--color-ink-3)]">$</span>
                <input
                  name={`share:${m.id}`}
                  type="text"
                  inputMode="decimal"
                  value={cents === 0 ? '' : (cents / 100).toFixed(2)}
                  placeholder="0.00"
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                    const n = Number(cleaned)
                    const nextCents = Number.isFinite(n) ? Math.round(n * 100) : 0
                    setAmounts((prev) => ({ ...prev, [m.id]: nextCents }))
                  }}
                  className="w-20 bg-transparent text-right font-serif text-[15px] tabular-nums text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-3)]"
                />
              </div>
            </label>
          )
        })}
      </div>

      {overshoot && (
        <p
          className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          Shares can&rsquo;t exceed the transaction total ({formatMoney(sum)} &gt; {formatMoney(totalAbs)}).
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending || overshoot}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[13px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save split'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] font-semibold text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
