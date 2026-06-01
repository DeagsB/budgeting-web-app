'use client'

import { useState } from 'react'
import { updateTransaction, deleteTransaction } from './actions'
import { CategorySelect } from './category-select'
import { SplitEditor } from './split-editor'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Amount } from '@/components/ui/amount'

type TransactionVM = {
  id: string
  occurred_on: string
  occurredLabel: string
  amount_cents: number
  description: string | null
  account_id: string
  accountName: string
  primary_category_id: string | null
  categorySummary: string
  isSplit: boolean
  isShared: boolean
  splits: { category_id: string | null; amount_cents: number }[]
  member_id: string | null
  memberName: string | null
}

export function TransactionRow({
  transaction: t,
  accounts,
  categories,
  members,
}: {
  transaction: TransactionVM
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [showSplits, setShowSplits] = useState(false)

  // ───────── EDIT MODE ─────────
  if (editing) {
    const abs = Math.abs(t.amount_cents)
    const dir = t.amount_cents < 0 ? 'in' : 'out'
    return (
      <li className="bg-[var(--color-cream-2)]/60 px-5 py-4">
        <form
          action={async (fd) => {
            await updateTransaction(fd)
            setEditing(false)
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={t.id} />

          <div className="grid gap-2 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <MicroLabel>Date</MicroLabel>
              <input
                name="occurred_on"
                type="date"
                defaultValue={t.occurred_on}
                required
                className="maple-input sm"
              />
            </div>
            <div className="sm:col-span-2">
              <MicroLabel>Amount</MicroLabel>
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                defaultValue={(abs / 100).toFixed(2)}
                required
                className="maple-input sm tabular"
              />
            </div>
            <div className="sm:col-span-2">
              <MicroLabel>Direction</MicroLabel>
              <select name="direction" defaultValue={dir} className="maple-select sm">
                <option value="out">Spent</option>
                <option value="in">Received</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <MicroLabel>Account</MicroLabel>
              <select name="account_id" defaultValue={t.account_id} className="maple-select sm">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <MicroLabel>Category</MicroLabel>
              <CategorySelect
                name="category_id"
                categories={categories}
                defaultValue={t.primary_category_id ?? ''}
                compact
              />
              {t.isSplit && (
                <p
                  className="mt-1 rounded-[8px] px-2 py-1 text-[11px]"
                  style={{ background: 'var(--color-butter)', color: 'var(--color-ink)' }}
                >
                  This transaction is split. Changing the category here replaces every split with one row.
                </p>
              )}
            </div>

            <div className="sm:col-span-3">
              <MicroLabel>Member</MicroLabel>
              <select name="member_id" defaultValue={t.member_id ?? ''} className="maple-select sm">
                <option value="">Shared</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-3">
              <MicroLabel>Description</MicroLabel>
              <input
                name="description"
                defaultValue={t.description ?? ''}
                maxLength={500}
                placeholder="Optional"
                className="maple-input sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  // ───────── DISPLAY MODE ─────────
  // Sign convention: positive cents = outflow (spent), negative = inflow.
  // Non-color cue: a leading '-' on outflow, '+' on inflow, so direction is
  // legible without relying on the maple/leaf tint alone.
  const isExpense = t.amount_cents > 0
  const amountTone = isExpense ? 'maple' : 'leaf'
  const sign = isExpense ? '-' : '+'
  const totalAbs = Math.abs(t.amount_cents)

  // Small color disc derived from category name (stable, brand-safe palette)
  const disc = discColorFor(t.categorySummary)

  return (
    <li className="flex flex-col">
      <div className="group flex items-start gap-3 px-5 py-4 text-[14px] transition-colors hover:bg-[var(--color-cream-2)]/40">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[14px] text-[var(--color-ink)]"
          style={{ background: disc.bg, color: disc.fg }}
          aria-hidden
        >
          {initialFor(t.categorySummary, t.description)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 truncate font-medium text-[var(--color-ink)]">
              {t.description ?? '—'}
              {t.isSplit && (
                <span
                  className="ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
                  style={{ background: 'var(--color-paper-2)', color: 'var(--color-ink-2)' }}
                >
                  Split
                </span>
              )}
              {t.isShared && (
                <span
                  className="ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
                  style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
                >
                  Shared
                </span>
              )}
            </div>
            <div className="shrink-0 text-[17px] tracking-[-0.01em]">
              <span className={isExpense ? 'text-maple' : 'text-leaf'} aria-hidden>
                {sign}
              </span>
              <Amount cents={totalAbs} tone={amountTone} className="text-[17px]" />
            </div>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-[var(--color-ink-3)]">
            <span className="truncate">{t.categorySummary}</span>
            <span>·</span>
            <span>{t.accountName}</span>
            <span>·</span>
            <span>{t.memberName ?? 'Shared'}</span>
          </div>

          {/* Row actions — always visible (no hover gating) with ≥44px tap
              targets so they work on touch without a hover state. */}
          <div className="-ml-1 mt-1.5 flex flex-wrap items-center gap-1 text-[12px]">
            <button
              type="button"
              onClick={() => setShowSplits((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
            >
              {showSplits ? 'Hide splits' : 'Splits'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
            >
              Edit
            </button>
            <ConfirmButton
              action={deleteTransaction}
              formData={{ id: t.id }}
              prompt="Delete this transaction?"
              description="The transaction and its splits will be removed. This can't be undone."
              confirmLabel="Delete"
              destructive
              className="inline-flex min-h-[44px] items-center rounded-md px-2 font-semibold text-maple transition-colors hover:bg-maple-soft"
            >
              Delete
            </ConfirmButton>
          </div>
        </div>
      </div>

      {showSplits && (
        <div className="border-t border-[var(--color-hair)] bg-[var(--color-cream-2)] px-5 py-5">
          <SplitEditor
            transactionId={t.id}
            totalAmountCents={t.amount_cents}
            initialSplits={t.splits}
            categories={categories}
          />
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
      {children}
    </span>
  )
}

/**
 * Deterministic color disc for a transaction. Uses the Maple palette (leaf,
 * maple, butter, amber-ish etc.) so rows feel branded without painting them.
 */
const DISC_PALETTE: { bg: string; fg: string }[] = [
  { bg: 'var(--color-leaf-soft)', fg: 'var(--color-leaf)' },
  { bg: 'var(--color-maple-soft)', fg: 'var(--color-maple)' },
  { bg: 'var(--color-butter)', fg: 'var(--color-ink)' },
  { bg: 'var(--color-paper-2)', fg: 'var(--color-ink)' },
  { bg: 'var(--color-cream-2)', fg: 'var(--color-ink)' },
]

function discColorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return DISC_PALETTE[Math.abs(h) % DISC_PALETTE.length]
}

function initialFor(category: string, description: string | null): string {
  const source =
    (description?.trim() && description) || (category?.trim() && category) || '—'
  return (source.trim()[0] ?? '·').toUpperCase()
}
