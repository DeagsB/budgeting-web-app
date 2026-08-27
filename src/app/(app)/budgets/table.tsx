'use client'

import { Fragment, useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { MapleLabel } from '@/components/ui/label'
import { formatMoney, formatMoneySigned } from '@/lib/format'
import { saveBudgets } from './actions'

type Category = {
  id: string
  parent_id: string | null
  name: string
  code: string
}

type Scope = 'standing' | 'month'

type SaveStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string }

/**
 * Maple budget editor.
 *
 * Budgets are standing: an amount applies to every month until it is changed.
 * A row can be pinned to the month on screen instead, which writes an override
 * for that month only and leaves the standing amount alone.
 *
 * Mobile-first: the primary layout is a stacked card list (one editable card
 * per category). The dense spreadsheet-style table is reserved for `sm:`+ where
 * the extra columns fit. Both layouts render the same category twice, so the
 * visible fields are controlled and unnamed and the form posts one hidden
 * field per category - otherwise every save would submit each amount twice.
 *
 * The save bar is sticky above the bottom tab bar on mobile and reports its
 * outcome honestly: green "Saved" only when the server action returns ok, an
 * error message otherwise. Status lives in an aria-live region.
 */
export function BudgetTable({
  month,
  monthLabel,
  categories,
  budgetByCat,
  actualRolled,
  actualDirect,
  ytdBudget,
  ytdActualRolled,
  overridden,
}: {
  month: string
  monthLabel: string
  categories: Category[]
  budgetByCat: Record<string, number>
  actualRolled: Record<string, number>
  actualDirect: Record<string, number>
  ytdBudget: Record<string, number>
  ytdActualRolled: Record<string, number>
  /** Categories whose amount this month comes from an override, not the standing budget. */
  overridden: string[]
}) {
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, ((budgetByCat[c.id] ?? 0) / 100).toFixed(2)])),
  )
  const [scopes, setScopes] = useState<Record<string, Scope>>(() =>
    Object.fromEntries(
      categories.map((c) => [c.id, overridden.includes(c.id) ? 'month' : 'standing'] as const),
    ),
  )

  const shortMonth = monthLabel.split(' ')[0]

  // Flatten into render rows so the mobile cards and the desktop table iterate
  // the same shape (parent rows roll up children; child rows use direct spend).
  const rows = parents.flatMap((p) => {
    const pBudget = budgetByCat[p.id] ?? 0
    const pActual = actualRolled[p.id] ?? 0

    const parentRow: RenderRow = {
      id: p.id,
      name: p.name,
      code: p.code,
      depth: 0,
      budget: pBudget,
      actual: pActual,
      variance: pActual - pBudget,
      ytdVariance: (ytdActualRolled[p.id] ?? 0) - (ytdBudget[p.id] ?? 0),
    }

    const kidRows: RenderRow[] = childrenOf(p.id).map((c) => {
      const b = budgetByCat[c.id] ?? 0
      const a = actualDirect[c.id] ?? 0
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        depth: 1,
        budget: b,
        actual: a,
        variance: a - b,
        ytdVariance: (ytdActualRolled[c.id] ?? actualDirect[c.id] ?? 0) - (ytdBudget[c.id] ?? 0),
      }
    })

    return [{ parent: parentRow, kids: kidRows }]
  })

  const field = (id: string) => ({
    value: amounts[id] ?? '',
    scope: scopes[id] ?? ('standing' as Scope),
    monthLabel: shortMonth,
    onAmount: (v: string) => setAmounts((prev) => ({ ...prev, [id]: v })),
    onScope: () =>
      setScopes((prev) => ({ ...prev, [id]: prev[id] === 'month' ? 'standing' : 'month' })),
  })

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await saveBudgets(fd)
          if (result.ok) {
            setStatus({ kind: 'saved' })
            setTimeout(() => setStatus({ kind: 'idle' }), 2500)
          } else {
            setStatus({ kind: 'error', message: result.error })
          }
        })
      }
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="month" value={month} />
      {categories.map((c) => (
        <Fragment key={`post-${c.id}`}>
          <input type="hidden" name={`budget:${c.id}`} value={amounts[c.id] ?? ''} />
          <input type="hidden" name={`scope:${c.id}`} value={scopes[c.id] ?? 'standing'} />
        </Fragment>
      ))}

      {/* ── Mobile: stacked card list (primary) ── */}
      <div className="flex flex-col gap-4 sm:hidden">
        {rows.map(({ parent, kids }) => (
          <div
            key={parent.id}
            className="overflow-hidden rounded-lg border border-hair bg-paper shadow-[var(--shadow-card)]"
          >
            <BudgetCard row={parent} field={field(parent.id)} />
            {kids.map((k) => (
              <BudgetCard key={k.id} row={k} field={field(k.id)} child />
            ))}
          </div>
        ))}
      </div>

      {/* ── Desktop: dense table (sm:+) ── */}
      <div className="hidden overflow-hidden rounded-lg border border-hair bg-paper shadow-[var(--shadow-card)] sm:block">
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
          <MapleLabel>Categories</MapleLabel>
          <span className="text-[11px] text-ink-3">Edit any amount, then save</span>
        </header>
        <DataTable minWidth={780}>
          <caption className="sr-only">
            Budget by category: budgeted, actual, variance and year-to-date variance
          </caption>
          <thead>
            <tr className="border-b border-hair text-left text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th scope="col" className="px-5 py-2.5">Category</th>
              <th scope="col" className="px-3 py-2.5 text-right">Budgeted</th>
              <th scope="col" className="px-3 py-2.5 text-right">Applies to</th>
              <th scope="col" className="px-3 py-2.5 text-right">Actual</th>
              <th scope="col" className="px-3 py-2.5 text-right">Variance</th>
              <th scope="col" className="px-5 py-2.5 text-right">YTD</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ parent, kids }) => (
              <Fragment key={parent.id}>
                <TableRow row={parent} field={field(parent.id)} />
                {kids.map((k) => (
                  <TableRow key={k.id} row={k} field={field(k.id)} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </DataTable>
      </div>

      {/* ── Sticky save bar (above the bottom tab bar on mobile) ── */}
      <div
        className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex items-center justify-between gap-3 rounded-lg border border-hair bg-cream-2 px-4 py-3 shadow-[var(--shadow-float)] sm:bottom-3"
      >
        <div aria-live="polite" className="min-w-0 flex-1 text-[12px]">
          {status.kind === 'saved' ? (
            <span className="font-semibold text-leaf">✓ Saved</span>
          ) : status.kind === 'error' ? (
            <span className="font-semibold text-maple">{status.message}</span>
          ) : (
            <span className="text-ink-3">Amounts apply every month unless you pin one to {shortMonth}</span>
          )}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending} className="shrink-0">
          {pending ? 'Saving…' : 'Save budgets'}
        </Button>
      </div>
    </form>
  )
}

type RenderRow = {
  id: string
  name: string
  code: string
  depth: number
  budget: number
  actual: number
  variance: number
  ytdVariance: number
}

type Field = {
  value: string
  scope: Scope
  monthLabel: string
  onAmount: (v: string) => void
  onScope: () => void
}

function progressFor(row: RenderRow) {
  const pct = row.budget > 0 ? Math.min(1.2, row.actual / row.budget) : row.actual > 0 ? 1.2 : 0
  return { pct, over: row.variance > 0 }
}

function BudgetInput({ categoryId, field }: { categoryId: string; field: Field }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-ink-3 sm:text-[12px]">
        $
      </span>
      <input
        id={`budget-${categoryId}`}
        type="text"
        inputMode="decimal"
        value={field.value}
        onChange={(e) => field.onAmount(e.target.value)}
        aria-label="Budgeted amount"
        className="maple-input tabular sm w-full pl-6 text-right"
      />
    </div>
  )
}

/**
 * Flips one category between the standing budget and a one-month override.
 * The label states what the amount currently applies to, not what the click
 * will do - the pressed state carries that. Hidden until the row has an
 * amount, so an unbudgeted category isn't asked a question it can't answer.
 */
function ScopeToggle({ name, field }: { name: string; field: Field }) {
  const pinned = field.scope === 'month'
  if (!pinned && !(Number(field.value) > 0)) return null
  return (
    <button
      type="button"
      onClick={field.onScope}
      aria-pressed={pinned}
      title={
        pinned
          ? `Applies to ${field.monthLabel} only. Click to make it the standing amount for every month.`
          : `Applies to every month. Click to change it for ${field.monthLabel} only.`
      }
      className={
        'inline-flex min-h-[44px] items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition-colors sm:min-h-[28px] ' +
        (pinned
          ? 'bg-butter text-ink hover:brightness-95'
          : 'text-ink-3 hover:bg-cream-2 hover:text-ink-2')
      }
    >
      <span className="sr-only">Budget for {name} applies to</span>
      {pinned ? `${field.monthLabel} only` : 'Every month'}
    </button>
  )
}

// ── Mobile card ──
function BudgetCard({ row, field, child = false }: { row: RenderRow; field: Field; child?: boolean }) {
  const { pct, over } = progressFor(row)
  return (
    <div className={'border-b border-hair p-4 last:border-b-0 ' + (child ? 'bg-cream/40 pl-6' : '')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={
              child ? 'text-[14px] text-ink-2' : 'font-serif text-[16px] tracking-[-0.01em] text-ink'
            }
          >
            {row.name}
          </span>
          <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">{row.code}</div>
        </div>
        <div className="w-[140px] shrink-0">
          <BudgetInput categoryId={row.id} field={field} />
          <div className="mt-1 flex justify-end">
            <ScopeToggle name={row.name} field={field} />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
        <span className="text-ink-3">
          Spent <Amount cents={row.actual} className="text-[12px] text-ink-2" />
        </span>
        <span className="text-ink-3">
          {row.variance > 0 ? 'Over by ' : 'Left '}
          <Amount
            cents={Math.abs(row.variance)}
            tone={row.variance > 0 ? 'maple' : 'leaf'}
            className="text-[12px]"
          />
        </span>
      </div>

      {row.budget > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-2">
          <div
            role="progressbar"
            aria-label={`${row.name} budget used`}
            aria-valuenow={Math.round(pct * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, Math.round(pct * 100))}%`,
              background: over ? 'var(--color-maple)' : 'var(--color-leaf)',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ── Desktop table row ──
function TableRow({ row, field }: { row: RenderRow; field: Field }) {
  const isParent = row.depth === 0
  const { pct, over } = progressFor(row)
  const varColor =
    row.variance > 0 ? 'var(--color-maple)' : row.variance < 0 ? 'var(--color-leaf)' : 'var(--color-ink-2)'
  const ytdColor =
    row.ytdVariance > 0
      ? 'var(--color-maple)'
      : row.ytdVariance < 0
        ? 'var(--color-leaf)'
        : 'var(--color-ink-2)'

  return (
    <tr className={'border-b border-hair last:border-b-0 ' + (isParent ? 'bg-cream-2/40' : '')}>
      <td className={'py-3 pr-3 ' + (isParent ? 'pl-5' : 'pl-10')}>
        <span className={isParent ? 'font-serif text-[15px] text-ink' : 'text-[13.5px] text-ink-2'}>
          {row.name}
        </span>
        <div className="mt-0.5 font-mono text-[10.5px] text-ink-3">{row.code}</div>
        {row.budget > 0 && (
          <div className="mt-1.5 h-1 max-w-[240px] overflow-hidden rounded-full bg-cream-2">
            <div
              role="progressbar"
              aria-label={`${row.name} budget used`}
              aria-valuenow={Math.round(pct * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, Math.round(pct * 100))}%`,
                background: over ? 'var(--color-maple)' : 'var(--color-leaf)',
              }}
            />
          </div>
        )}
      </td>
      <td className="py-3 pr-3 text-right align-top">
        <div className="inline-block w-[112px]">
          <BudgetInput categoryId={row.id} field={field} />
        </div>
      </td>
      <td className="py-3 pr-3 text-right align-top">
        <ScopeToggle name={row.name} field={field} />
      </td>
      <td className="py-3 pr-3 text-right align-top tabular-nums text-ink">
        {formatMoney(row.actual)}
      </td>
      <td className="py-3 pr-3 text-right align-top tabular-nums" style={{ color: varColor }}>
        {row.variance === 0 ? '-' : formatMoneySigned(row.variance, { plus: true })}
        {row.variance > 0 && <span className="ml-1 text-[10.5px] font-semibold uppercase">over</span>}
      </td>
      <td className="py-3 pr-5 text-right align-top text-[12.5px] tabular-nums" style={{ color: ytdColor }}>
        {row.ytdVariance === 0 ? '-' : formatMoneySigned(row.ytdVariance, { plus: true })}
      </td>
    </tr>
  )
}
