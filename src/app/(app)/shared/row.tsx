'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatMoney } from '@/lib/format'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { MoneyInput } from '@/components/ui/money-input'
import { toggleShared, saveShareOverride, clearShares } from './actions'
import { RuleSheet, type RuleSheetMember } from '@/app/(app)/rules/rule-sheet'
import { prefillRuleFromTransaction } from '@/lib/transaction-rules'

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
  memberWeights,
  accounts,
  categories,
  accountId,
  ruleName,
  shares,
}: {
  transaction: Txn
  members: Member[]
  memberWeights: RuleSheetMember[]
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  accountId: string
  /** Name of the rule that produced these shares, if any. */
  ruleName: string | null
  shares: { member_id: string; amount_cents: number }[]
}) {
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isShared = shares.length > 0

  // Positive amount = expense (outflow). Sign in the list follows the Maple
  // convention on transactions.
  const isExpense = t.amount_cents > 0
  const totalAbs = Math.abs(t.amount_cents)

  const shareSum = shares.reduce((s, sh) => s + sh.amount_cents, 0)
  const payerShareCents = totalAbs - shareSum
  const nonPayerMembers = members.filter((m) => m.id !== t.payer_id)
  const amountByMember = new Map(shares.map((s) => [s.member_id, s.amount_cents]))
  const splitCount = shares.length + (t.payer_id ? 1 : 0)

  return (
    <li className="flex flex-col">
      <div className="flex items-start gap-3 px-5 py-4 text-[14px] sm:gap-4">
        {/* Maple-branded tick checkbox - 44px tap target wraps the 24px glyph */}
        <form
          action={(fd) =>
            startTransition(async () => {
              const res = await toggleShared(fd)
              setError(res && 'error' in res ? res.error : null)
            })
          }
          className="-my-2 -ml-2 shrink-0"
        >
          <input type="hidden" name="transaction_id" value={t.id} />
          <button
            type="submit"
            disabled={pending}
            aria-label={isShared ? 'Unshare transaction' : 'Share transaction'}
            aria-pressed={isShared}
            className="flex h-11 w-11 items-center justify-center disabled:opacity-50"
          >
            <span
              aria-hidden
              className={
                'flex h-6 w-6 items-center justify-center rounded-sm border transition-all active:scale-90 ' +
                (isShared
                  ? 'border-leaf bg-leaf text-paper shadow-[var(--shadow-card)]'
                  : 'border-hair bg-paper hover:border-ink-3')
              }
            >
              {isShared && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
          </button>
        </form>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate font-medium text-ink">
              {t.description ?? '-'}
            </div>
            <div className="shrink-0 text-[16px]">
              <Amount cents={t.amount_cents} sign="auto" tone={isExpense ? 'ink' : 'leaf'} />
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-3">
            <span>{t.occurredLabel}</span>
            <span>·</span>
            <span>{t.payerName ? `${t.payerName} paid` : 'Shared account'}</span>
            {isShared && (
              <>
                <span>·</span>
                <span className="inline-flex items-center rounded-full bg-leaf-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-leaf">
                  Split {splitCount}-way
                </span>
                {ruleName && (
                  <span className="inline-flex items-center rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-2">
                    Rule · {ruleName}
                  </span>
                )}
              </>
            )}
            {shareSum > totalAbs && (
              <span className="inline-flex items-center rounded-full bg-maple-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-maple">
                Shares exceed total
              </span>
            )}
          </div>
          {error && <p className="mt-1 text-[12px] font-medium text-maple">{error}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-1 text-[12px]">
            {isShared && (
              <>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex min-h-[44px] items-center font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                {editing ? 'Hide split' : 'Edit split'}
              </button>
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              <form
                action={(fd) =>
                  startTransition(async () => {
                    const res = await clearShares(fd)
                    setError(res && 'error' in res ? res.error : null)
                  })
                }
              >
                <input type="hidden" name="transaction_id" value={t.id} />
                <button
                  type="submit"
                  disabled={pending}
                  aria-label="Clear split"
                  className="inline-flex min-h-[44px] items-center font-semibold text-maple transition-colors hover:underline disabled:opacity-50"
                >
                  Clear
                </button>
              </form>
              <span aria-hidden className="text-ink-3">
                ·
              </span>
              </>
            )}
            {ruleName ? (
              <Link
                href="/rules"
                className="inline-flex min-h-[44px] items-center font-semibold text-leaf-deep underline-offset-2 hover:underline"
              >
                Manage rules
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setRuleOpen(true)}
                className="inline-flex min-h-[44px] items-center font-semibold text-leaf-deep underline-offset-2 hover:underline"
              >
                Always share
              </button>
            )}
          </div>
        </div>
      </div>

      <RuleSheet
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        initial={
          ruleOpen
            ? prefillRuleFromTransaction({ id: t.id, description: t.description, amount_cents: t.amount_cents, account_id: accountId, member_id: t.payer_id })
            : null
        }
        accounts={accounts}
        categories={categories}
        members={memberWeights}
      />

      {isShared && editing && (
        <div className="border-t border-hair bg-cream-2 px-5 py-5">
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-hair bg-cream-2/60 px-5 py-2.5 text-[11.5px] text-ink-2">
          {t.payerName && (
            <span>
              <strong className="font-semibold text-ink">{t.payerName}</strong> keeps{' '}
              <span className="tabular-nums text-ink">{formatMoney(payerShareCents)}</span>
            </span>
          )}
          {shares.map((s) => {
            const name = members.find((m) => m.id === s.member_id)?.name ?? 'Removed'
            return (
              <span key={s.member_id} className="inline-flex items-center gap-1">
                <span aria-hidden className="text-ink-3">
                  ·
                </span>
                <strong className="font-semibold text-ink">{name}</strong>{' '}
                <span>owes</span>
                <span className="tabular-nums text-ink">{formatMoney(s.amount_cents)}</span>
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
  const [invalid, setInvalid] = useState<Record<string, boolean>>({})
  const [pending, startTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const hasInvalid = Object.values(invalid).some(Boolean)
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
    setInvalid({})
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const res = await saveShareOverride(fd)
          if (res && 'error' in res) setSaveError(res.error)
          else onClose()
        })
      }
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="transaction_id" value={transactionId} />

      {/* Header + equal-split action */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Split editor
          </div>
          <div className="mt-0.5 font-serif text-[18px] leading-tight tracking-[-0.01em] text-ink">
            Total <span className="tabular-nums">{formatMoney(totalAbs)}</span>
          </div>
          {payerName && (
            <div className="mt-0.5 text-[12px] text-ink-2">
              <strong className="font-semibold text-ink">{payerName}</strong> keeps{' '}
              <span className="tabular-nums text-ink">{formatMoney(leftover)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={setEqual}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-hair bg-paper px-3 text-[12px] font-semibold text-ink transition-colors hover:bg-cream"
        >
          Split equally
        </button>
      </div>

      {/* Progress bar toward total - color + "over total" text both signal overshoot */}
      <div className="h-1.5 overflow-hidden rounded-full bg-paper">
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={overshoot ? 'Shares over total' : 'Shares allocated'}
          className={`h-full rounded-full transition-all duration-300 ${overshoot ? 'bg-maple' : 'bg-leaf'}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      {/* Share inputs */}
      <div className="grid gap-2 sm:grid-cols-2">
        {nonPayerMembers.map((m) => {
          const cents = amounts[m.id] ?? 0
          const inputId = `share-${transactionId}-${m.id}`
          return (
            <label
              key={m.id}
              htmlFor={inputId}
              className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-hair bg-paper px-3 py-2.5 text-[13.5px] transition-colors focus-within:border-leaf"
            >
              <span className="min-w-0 truncate text-ink">
                {m.name} <span className="text-ink-3">owes</span>
              </span>
              <div className="flex items-center">
                <span className="text-[12px] text-ink-3">$</span>
                <div className="w-24">
                  <MoneyInput
                    id={inputId}
                    cents={cents}
                    aria-label={`${m.name} owes`}
                    onCents={(next) => {
                      setInvalid((prev) => ({ ...prev, [m.id]: next === null }))
                      if (next !== null) setAmounts((prev) => ({ ...prev, [m.id]: next }))
                    }}
                  />
                </div>
                {/* Server parses dollars under `share:<member>`; post the committed cents as dollars. */}
                <input type="hidden" name={`share:${m.id}`} value={(cents / 100).toFixed(2)} />
              </div>
            </label>
          )
        })}
      </div>

      {overshoot && (
        <p className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          Over total - shares can&rsquo;t exceed the transaction total ({formatMoney(sum)} &gt;{' '}
          {formatMoney(totalAbs)}).
        </p>
      )}

      {hasInvalid && (
        <p className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          Enter each share as a dollar amount, e.g. 12.50.
        </p>
      )}

      {saveError && <p className="text-[12.5px] font-medium text-maple">{saveError}</p>}

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" variant="primary" disabled={pending || overshoot || hasInvalid}>
          {pending ? 'Saving…' : 'Save split'}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
