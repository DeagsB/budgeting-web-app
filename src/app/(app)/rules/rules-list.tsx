'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Sheet } from '@/components/ui/sheet'
import { formatMoney } from '@/lib/format'
import { describeRuleMatch, prefillRuleFromTransaction, type TransactionRule } from '@/lib/transaction-rules'
import { RuleSheet, type RuleSheetInitial, type RuleSheetMember } from './rule-sheet'
import { applyRuleToExisting, deleteRule, reorderRule, toggleRuleEnabled } from './actions'

export type RuleRowVM = {
  rule: TransactionRule
  matchCount: number
  sharedCount: number
  accountName: string | null
  categoryName: string | null
  customLabel: string | null
}

export function RulesList({
  rows,
  accounts,
  categories,
  members,
  seed,
}: {
  rows: RuleRowVM[]
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: RuleSheetMember[]
  seed: { desc: string; amount: number | null } | null
}) {
  const [editing, setEditing] = useState<RuleSheetInitial | null>(() =>
    seed
      ? prefillRuleFromTransaction({ id: 'seed', description: seed.desc, amount_cents: seed.amount ?? 0, account_id: '', member_id: null })
      : null,
  )
  const [open, setOpen] = useState(seed !== null)

  function openNew() {
    setEditing({
      name: '',
      match_text: '',
      amount_min_cents: null,
      amount_max_cents: null,
      account_id: null,
      direction: 'outflow',
      share_mode: 'household',
      category_id: null,
    })
    setOpen(true)
  }

  function openEdit(r: TransactionRule) {
    setEditing({
      id: r.id,
      name: r.name,
      match_text: r.match_text,
      amount_min_cents: r.amount_min_cents,
      amount_max_cents: r.amount_max_cents,
      account_id: r.account_id,
      direction: r.direction,
      share_mode: r.share_mode,
      share_weights: r.share_weights,
      category_id: r.category_id,
    })
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-ink-2">
          Rules run top to bottom; for each transaction the first match decides sharing and the first with a category decides category.
        </p>
        <Button type="button" variant="primary" onClick={openNew} className="shrink-0">
          New rule
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No rules yet"
          body="Open a transaction and tap “Always share” to create your first one, or start from scratch here. Rent, hydro and streaming subscriptions are the usual suspects."
          action={
            <Button type="button" variant="primary" onClick={openNew}>
              Create a rule
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => (
            <RuleRow key={row.rule.id} row={row} first={i === 0} last={i === rows.length - 1} onEdit={() => openEdit(row.rule)} />
          ))}
        </ul>
      )}

      <RuleSheet open={open} onClose={() => setOpen(false)} initial={editing} accounts={accounts} categories={categories} members={members} />
    </div>
  )
}

function RuleRow({ row, first, last, onEdit }: { row: RuleRowVM; first: boolean; last: boolean; onEdit: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [unshare, setUnshare] = useState(true)
  const r = row.rule

  const action = (fn: (fd: FormData) => Promise<{ error: string } | { ok: true } | undefined | { ok: true; shared: number; categorized: number; skippedManual: number }>) =>
    (fd: FormData) =>
      start(async () => {
        const res = await fn(fd)
        if (res && 'error' in res) setNote(res.error)
        else if (res && 'shared' in res) {
          setNote(`Applied: ${res.shared} shared${res.categorized ? `, ${res.categorized} categorised` : ''}${res.skippedManual ? `, ${res.skippedManual} left as you set them` : ''}.`)
          router.refresh()
        } else {
          setNote(null)
          router.refresh()
        }
      })

  const shareLabel =
    r.share_mode === 'household' ? 'Household ratio' : r.share_mode === 'custom' ? `Custom ${row.customLabel ?? ''}` : 'Not shared'

  return (
    <li>
      <Card padding="md" className={r.enabled ? '' : 'opacity-60'}>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-serif text-[18px] leading-tight text-ink">{r.name}</span>
                {!r.enabled && <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">Paused</span>}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink-2">{describeRuleMatch(r, formatMoney, row.accountName)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                <span className="rounded-full bg-leaf-soft px-2 py-0.5 font-semibold text-leaf-deep">{shareLabel}</span>
                {row.categoryName && <span className="rounded-full bg-paper-2 px-2 py-0.5 font-semibold text-ink-2">→ {row.categoryName}</span>}
              </div>
              <div className="mt-1 text-[12px] text-ink-3">
                {row.matchCount} match{row.matchCount === 1 ? '' : 'es'} in the last 12 months · {row.sharedCount} auto-shared
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <form action={action(reorderRule)}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={pending || first} aria-label="Move up" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-cream-2 disabled:opacity-30">
                  ▲
                </button>
              </form>
              <form action={action(reorderRule)}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" disabled={pending || last} aria-label="Move down" className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-cream-2 disabled:opacity-30">
                  ▼
                </button>
              </form>
            </div>
          </div>

          <div className="-ml-2 flex flex-wrap items-center gap-1 text-[12.5px]">
            <button type="button" onClick={onEdit} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline">
              Edit
            </button>
            <form action={action(applyRuleToExisting)}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" disabled={pending || !r.enabled} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-50">
                Apply to past
              </button>
            </form>
            <form action={action(toggleRuleEnabled)}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="enabled" value={r.enabled ? 'false' : 'true'} />
              <button type="submit" disabled={pending} aria-pressed={r.enabled} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-50">
                {r.enabled ? 'Pause' : 'Resume'}
              </button>
            </form>
            <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-maple hover:underline">
              Delete
            </button>
          </div>
          {note && <p className="text-[12.5px] text-ink-2">{note}</p>}
        </div>
      </Card>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title={`Delete “${r.name}”?`}>
        <form action={action(deleteRule)} className="flex flex-col gap-4 pb-2" onSubmit={() => setConfirmDelete(false)}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="unshare" value={unshare ? 'yes' : 'no'} />
          <p className="text-[13.5px] leading-relaxed text-ink-2">New transactions will no longer match this rule.</p>
          <label className="flex min-h-[44px] items-center gap-3 rounded-md bg-cream-2 px-3 text-[13.5px] text-ink">
            <input type="checkbox" checked={unshare} onChange={(e) => setUnshare(e.target.checked)} className="h-5 w-5 accent-[var(--color-leaf)]" />
            <span>
              Also unshare the {row.sharedCount} transaction{row.sharedCount === 1 ? '' : 's'} this rule shared
              <span className="block text-[11.5px] text-ink-3">Splits you edited by hand are never touched.</span>
            </span>
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" className="bg-maple">
              Delete rule
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Sheet>
    </li>
  )
}
