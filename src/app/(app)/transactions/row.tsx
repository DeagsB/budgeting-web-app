'use client'

import { useMemo, useState, useTransition } from 'react'
import { updateTransaction, deleteTransaction, setTransactionCategory, unlinkTransfer } from './actions'
import { toggleShared } from '@/app/(app)/shared/actions'
import { transferNoun } from '@/lib/transfer-label'
import type { TransferKind } from '@/lib/transfer-match'
import { useToast } from '@/components/ui/toast'
import { CategorySelect } from './category-select'
import { QuickCategorize } from './quick-categorize'
import { SplitEditor } from './split-editor'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { RuleSheet, type RuleSheetMember } from '@/app/(app)/rules/rule-sheet'
import { prefillRuleFromTransaction } from '@/lib/transaction-rules'
import { useUncategorizedCount } from './uncategorized-count'

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
  isRuleShared?: boolean
  splits: { category_id: string | null; amount_cents: number }[]
  member_id: string | null
  /** Display name of the payer, for crossover rows another member paid. */
  payerName: string | null
  /** True when the signed-in member is the payer. */
  isMine: boolean
  /**
   * False for rows this login can only see because it holds a share of them
   * (mirrors the `tx_editable` RLS helper). Write affordances are hidden;
   * the server would reject them anyway.
   */
  canEdit?: boolean
  /**
   * Set when this row is one leg of a transfer between the household's own
   * accounts. The leg is neither income nor expense: it reads as the label
   * ("Card payment to Visa") instead of a category, never asks to be
   * categorized, and offers "Not a transfer" instead of sharing.
   */
  transfer?: { transferId: string; label: string; kind: TransferKind } | null
}

export function TransactionRow({
  transaction: t,
  accounts,
  categories,
  memberWeights,
  isUncategorized = false,
  topCategoryIds = [],
  dayLabel,
}: {
  transaction: TransactionVM
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  /** Members with household split weights, for the "Always share" rule sheet. */
  memberWeights: RuleSheetMember[]
  isUncategorized?: boolean
  topCategoryIds?: string[]
  /**
   * When set, renders this row's date inline in the meta line. Used by the
   * "To categorize" section at the top of the list, which pulls rows out of
   * their day group so they no longer sit under a day header of their own.
   */
  dayLabel?: string
}) {
  const [editing, setEditing] = useState(false)
  const [showSplits, setShowSplits] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [sharePending, startShare] = useTransition()
  const { toast } = useToast()
  const canEdit = t.canEdit ?? true

  // ───────── Quick categorize (row-local, optimistic) ─────────
  // The chip strip on an uncategorized row must show its result on the tap
  // itself, not after the next server round trip - a revalidate triggered
  // from inside a Server Action isn't guaranteed to reach every mounted
  // instance of this row promptly, which is what made chip taps look like
  // they'd silently failed even on a 200. So the picked category lives here,
  // optimistically, and only reverts if the save comes back with an error.
  const [optimisticCategoryId, setOptimisticCategoryId] = useState<string | null>(null)
  const [categorizeError, setCategorizeError] = useState<string | null>(null)
  const [categorizePending, startCategorize] = useTransition()
  const uncategorizedCount = useUncategorizedCount()
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  // Once the server confirms this row is no longer uncategorized (or a fresh
  // row lands under a reused key), drop any optimistic override so it can't
  // outlive what it stood in for. Adjusted during render (React's documented
  // pattern for resetting state when a prop changes) rather than in an
  // effect, so it can't cause an extra cascading render.
  const rowKey = `${t.id}:${isUncategorized}`
  const [prevRowKey, setPrevRowKey] = useState(rowKey)
  if (rowKey !== prevRowKey) {
    setPrevRowKey(rowKey)
    setOptimisticCategoryId(null)
    setCategorizeError(null)
  }

  // A transfer leg is never "to categorize": the pair is what explains it.
  const effectiveUncategorized = isUncategorized && optimisticCategoryId === null && !t.transfer
  const effectiveCategorySummary =
    optimisticCategoryId !== null
      ? (categoryById.get(optimisticCategoryId)?.name ?? t.categorySummary)
      : t.categorySummary
  // What the meta line says about the row: the transfer label on a leg (the
  // category underneath is cosmetic there), the category summary otherwise.
  const metaLabel = t.transfer ? t.transfer.label : effectiveCategorySummary

  function handleQuickPick(categoryId: string) {
    setCategorizeError(null)
    setOptimisticCategoryId(categoryId)
    startCategorize(async () => {
      const fd = new FormData()
      fd.set('id', t.id)
      fd.set('category_id', categoryId)
      const res = await setTransactionCategory(fd)
      if (res && 'error' in res) {
        setOptimisticCategoryId(null)
        setCategorizeError(res.error)
      } else {
        uncategorizedCount?.markCategorized(t.id)
      }
    })
  }

  // One-tap share / unshare by the household ratio (same action as the
  // checkbox on the Shared page). The page revalidates, so the badge and
  // the button label flip once the server confirms.
  function onToggleShare() {
    startShare(async () => {
      const fd = new FormData()
      fd.set('transaction_id', t.id)
      const res = await toggleShared(fd)
      if (res && 'error' in res) toast({ title: res.error, tone: 'ink' })
      else toast({ title: t.isShared ? 'No longer shared.' : 'Shared with the household.', tone: 'leaf' })
    })
  }

  // "Not a transfer": both legs go back to plain rows. The page revalidates
  // (pill and label drop on both), and the legs that are uncategorized again
  // are pushed into the header count right away so it never lags the list.
  async function onUnlinkTransfer(fd: FormData) {
    const res = await unlinkTransfer(fd)
    if ('error' in res) {
      toast({ title: res.error, tone: 'ink' })
      return
    }
    uncategorizedCount?.markRequeued(res.requeued)
    toast({ title: 'No longer a transfer.', tone: 'leaf' })
  }

  // ───────── EDIT MODE ─────────
  if (editing && canEdit) {
    const abs = Math.abs(t.amount_cents)
    const dir = t.amount_cents < 0 ? 'in' : 'out'
    return (
      <li className="bg-cream-2/60 px-5 py-4">
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
                <p className="mt-1 rounded-md bg-butter px-2 py-1 text-[11px] text-ink">
                  This transaction is split. Changing the category here replaces every split with one row.
                </p>
              )}
            </div>

            <div className="sm:col-span-6">
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
            <Button type="submit" variant="primary" size="sm">
              Save
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
        {/* Delete lives with Edit, not on every row: the row strip stays one
            line of everyday actions and the destructive one sits behind an
            intent. ConfirmButton renders its own <form>, so it must be a
            sibling of the edit form, never nested inside it. */}
        <div className="mt-3 flex justify-end border-t border-hair pt-2">
          <ConfirmButton
            action={deleteTransaction}
            formData={{ id: t.id }}
            prompt="Delete this transaction?"
            description="The transaction and its splits will be removed. This can't be undone."
            confirmLabel="Delete"
            destructive
            className="inline-flex min-h-[44px] items-center rounded-md px-2 text-[12px] font-semibold text-maple transition-colors hover:bg-maple-soft"
          >
            Delete transaction
          </ConfirmButton>
        </div>
      </li>
    )
  }

  // ───────── DISPLAY MODE ─────────
  // Sign convention: positive cents = outflow (spent), negative = inflow.
  // Non-color cue: a leading '-' on outflow, '+' on inflow, so direction is
  // legible without relying on the maple/leaf tint alone. A transfer leg
  // keeps the glyph (the money did leave / land on this account) but drops
  // the tint: it is neither spending nor income.
  const isExpense = t.amount_cents > 0
  const amountTone = t.transfer ? 'ink' : isExpense ? 'maple' : 'leaf'
  const sign = isExpense ? '-' : '+'
  const totalAbs = Math.abs(t.amount_cents)

  // Small color disc derived from the meta label (stable, brand-safe
  // palette). Uses the effective (optimistic) summary so the disc and initial
  // update the instant a quick-categorize chip lands, alongside the badge
  // below.
  const disc = discColorFor(metaLabel)

  return (
    <li className="flex flex-col">
      <div className="group flex items-start gap-3 px-5 py-4 text-[14px] transition-colors hover:bg-cream-2/40">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-serif text-[14px]"
          style={{ background: disc.bg, color: disc.fg }}
          aria-hidden
        >
          {initialFor(metaLabel, t.description)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            {/* The title truncates on its own; the pills never do - a long
                merchant name must not swallow the Split / Transfer / Shared
                badge that says what kind of row this is. */}
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
              <span className="min-w-0 truncate">{t.description ?? '-'}</span>
              {t.isSplit && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-2">
                  Split
                </span>
              )}
              {t.transfer && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-ink-2">
                  {transferNoun(t.transfer.kind)}
                </span>
              )}
              {t.isShared && (
                <span className="inline-flex shrink-0 items-center rounded-full bg-leaf-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-leaf">
                  {t.isRuleShared ? 'Auto-shared' : 'Shared'}
                </span>
              )}
            </div>
            <div className="shrink-0 text-[17px] tracking-[-0.01em]">
              <span className={t.transfer ? 'text-ink' : isExpense ? 'text-maple' : 'text-leaf'} aria-hidden>
                {sign}
              </span>
              <Amount cents={totalAbs} tone={amountTone} className="text-[17px]" />
            </div>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-ink-3">
            {dayLabel && (
              <>
                <span className="shrink-0 font-semibold text-ink-2">{dayLabel}</span>
                <span>·</span>
              </>
            )}
            {effectiveUncategorized ? (
              <span className="inline-flex items-center rounded-full bg-butter px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-ink">
                Uncategorized
              </span>
            ) : (
              <span className="truncate">{metaLabel}</span>
            )}
            <span>·</span>
            <span>{t.accountName}</span>
            {/* Payer: nothing for your own rows; "Joint" when nobody in
                particular paid (ingested onto a joint account); the payer's
                name on rows another member paid. */}
            {!t.isMine && (
              <>
                <span>·</span>
                <span>{t.member_id === null ? 'Joint' : (t.payerName ?? 'Another member')}</span>
              </>
            )}
          </div>

          {/* Quick categorize - the chip strip lives directly on every
              uncategorized row (no toggle to open it), collapses the instant
              a chip lands, and only reappears if the save is rejected. */}
          {canEdit && effectiveUncategorized && (
            <div className="mt-2">
              <QuickCategorize
                categories={categories}
                topCategoryIds={topCategoryIds}
                onPick={handleQuickPick}
                pending={categorizePending}
              />
            </div>
          )}
          {categorizeError && (
            <p role="alert" className="mt-1.5 rounded-md bg-maple-soft px-2.5 py-1.5 text-[12px] font-medium text-maple">
              {categorizeError}
            </p>
          )}

          {/* Row actions - always visible (no hover gating) with ≥44px tap
              targets so they work on touch without a hover state. */}
          {!canEdit && (
            <p className="mt-1.5 text-[12px] text-ink-3">
              Shared with you by {t.payerName ?? 'another member'} - view only.
            </p>
          )}
          {canEdit && (
            <div className="hide-scroll -ml-1 mt-1.5 flex flex-nowrap items-center gap-0.5 overflow-x-auto whitespace-nowrap text-[12px]">
            <button
              type="button"
              onClick={() => setShowSplits((v) => !v)}
              className="inline-flex min-h-[44px] items-center rounded-md px-1 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
            >
              {showSplits ? 'Hide splits' : 'Splits'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center rounded-md px-1 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink"
            >
              Edit
            </button>
            {/* Sharing a transfer leg is meaningless (nobody spent anything),
                and dropping Share / Auto-share is also what keeps the rail on
                one line at 390px once "Not a transfer" joins it. ConfirmButton
                renders its own <form>; this rail is a plain div, so that is
                fine here. */}
            {t.transfer ? (
              <ConfirmButton
                action={onUnlinkTransfer}
                formData={{ transfer_id: t.transfer.transferId }}
                prompt="Not a transfer?"
                description="Both sides go back to being a normal expense and income, and Maple won't pair them again."
                confirmLabel="Not a transfer"
                className="inline-flex min-h-[44px] items-center rounded-md px-1 font-semibold text-ink-2 transition-colors hover:bg-cream-2 hover:text-ink disabled:opacity-50"
              >
                Not a transfer
              </ConfirmButton>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onToggleShare}
                  disabled={sharePending}
                  aria-pressed={t.isShared}
                  className={
                    'inline-flex min-h-[44px] items-center gap-1 rounded-md px-1 font-semibold transition-colors disabled:opacity-50 ' +
                    (t.isShared ? 'text-ink-2 hover:bg-cream-2 hover:text-ink' : 'text-leaf-deep hover:bg-leaf-soft')
                  }
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="9" cy="8" r="3" />
                    <circle cx="17" cy="9" r="2.4" />
                    <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                    <path d="M15 19c0-2 1.5-4 4-4" />
                  </svg>
                  {sharePending ? (t.isShared ? 'Unsharing…' : 'Sharing…') : t.isShared ? 'Unshare' : 'Share'}
                </button>
                <button
                  type="button"
                  onClick={() => setRuleOpen(true)}
                  className="inline-flex min-h-[44px] items-center rounded-md px-1 font-semibold text-leaf-deep transition-colors hover:bg-leaf-soft"
                >
                  Auto-share
                </button>
              </>
            )}
            </div>
          )}
        </div>
      </div>

      {showSplits && (
        <div className="border-t border-hair bg-cream-2 px-5 py-5">
          <SplitEditor
            transactionId={t.id}
            totalAmountCents={t.amount_cents}
            initialSplits={t.splits}
            categories={categories}
          />
        </div>
      )}

      <RuleSheet
        open={ruleOpen}
        onClose={() => setRuleOpen(false)}
        initial={
          ruleOpen
            ? prefillRuleFromTransaction({
                id: t.id,
                description: t.description,
                amount_cents: t.amount_cents,
                account_id: t.account_id,
                member_id: t.member_id,
                category_id: t.primary_category_id,
              })
            : null
        }
        accounts={accounts}
        categories={categories}
        members={memberWeights}
      />
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function MicroLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
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
    (description?.trim() && description) || (category?.trim() && category) || '-'
  return (source.trim()[0] ?? '·').toUpperCase()
}
