'use client'

import { Fragment, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import { saveBudgets } from './actions'

type Category = {
  id: string
  parent_id: string | null
  name: string
  code: string
  rollover_enabled: boolean
}

/**
 * Maple budget table.
 *
 * - Parent rows highlighted with a cream band; children indent beneath.
 * - Per-row progress bar visualizes spend vs effective budget (budget + rollover).
 * - Rollover credit shown as a pill when nonzero; muted em-dash otherwise.
 * - Sticky save bar at the bottom with subtle confirmation toast.
 */
export function BudgetTable({
  month,
  categories,
  budgetByCat,
  actualRolled,
  actualDirect,
  ytdBudget,
  ytdActualRolled,
  rolloverCredit,
}: {
  month: string
  categories: Category[]
  budgetByCat: Record<string, number>
  actualRolled: Record<string, number>
  actualDirect: Record<string, number>
  ytdBudget: Record<string, number>
  ytdActualRolled: Record<string, number>
  rolloverCredit: Record<string, number>
}) {
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveBudgets(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        })
      }
      className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]"
    >
      <input type="hidden" name="month" value={month} />

      <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
        <MapleLabel>Categories</MapleLabel>
        <span className="hidden text-[11px] text-[var(--color-ink-3)] sm:inline">
          Tap any amount to edit
        </span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--color-hair)] text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              <th className="px-5 py-2.5 text-left">Category</th>
              <th className="px-3 py-2.5 text-right">Budgeted</th>
              <th className="px-3 py-2.5 text-right">Rollover</th>
              <th className="px-3 py-2.5 text-right">Actual</th>
              <th className="px-3 py-2.5 text-right">Variance</th>
              <th className="px-5 py-2.5 text-right">YTD</th>
            </tr>
          </thead>
          <tbody>
            {parents.map((p) => (
              <Section
                key={p.id}
                parent={p}
                kids={childrenOf(p.id)}
                budgetByCat={budgetByCat}
                actualRolled={actualRolled}
                actualDirect={actualDirect}
                ytdBudget={ytdBudget}
                ytdActualRolled={ytdActualRolled}
                rolloverCredit={rolloverCredit}
              />
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-hair)] bg-[var(--color-cream-2)]/60 px-5 py-3">
        <span
          className={
            'text-[12px] transition-opacity ' +
            (saved ? 'font-semibold text-[var(--color-leaf)]' : 'text-[var(--color-ink-3)]')
          }
        >
          {saved ? '✓ Saved' : 'Update budgets and save your changes'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save budgets'}
        </button>
      </footer>
    </form>
  )
}

function Section({
  parent,
  kids,
  budgetByCat,
  actualRolled,
  actualDirect,
  ytdBudget,
  ytdActualRolled,
  rolloverCredit,
}: {
  parent: Category
  kids: Category[]
  budgetByCat: Record<string, number>
  actualRolled: Record<string, number>
  actualDirect: Record<string, number>
  ytdBudget: Record<string, number>
  ytdActualRolled: Record<string, number>
  rolloverCredit: Record<string, number>
}) {
  const pBudget = budgetByCat[parent.id] ?? 0
  const pActual = actualRolled[parent.id] ?? 0
  const pRollover = rolloverCredit[parent.id] ?? 0
  const pEffective = pBudget + pRollover
  const pVar = pActual - pEffective
  const pYtdVar = (ytdActualRolled[parent.id] ?? 0) - (ytdBudget[parent.id] ?? 0)

  return (
    <Fragment>
      <Row
        name={parent.name}
        code={parent.code}
        depth={0}
        categoryId={parent.id}
        budget={pBudget}
        effective={pEffective}
        rollover={pRollover}
        rolloverEnabled={parent.rollover_enabled}
        actual={pActual}
        variance={pVar}
        ytdVariance={pYtdVar}
      />
      {kids.map((c) => {
        const b = budgetByCat[c.id] ?? 0
        const a = actualDirect[c.id] ?? 0
        const r = rolloverCredit[c.id] ?? 0
        return (
          <Row
            key={c.id}
            name={c.name}
            code={c.code}
            depth={1}
            categoryId={c.id}
            budget={b}
            effective={b + r}
            rollover={r}
            rolloverEnabled={c.rollover_enabled}
            actual={a}
            variance={a - (b + r)}
            ytdVariance={(ytdActualRolled[c.id] ?? actualDirect[c.id] ?? 0) - (ytdBudget[c.id] ?? 0)}
          />
        )
      })}
    </Fragment>
  )
}

function Row({
  name,
  code,
  depth,
  categoryId,
  budget,
  effective,
  rollover,
  rolloverEnabled,
  actual,
  variance,
  ytdVariance,
}: {
  name: string
  code: string
  depth: number
  categoryId: string
  budget: number
  effective: number
  rollover: number
  rolloverEnabled: boolean
  actual: number
  variance: number
  ytdVariance: number
}) {
  const isParent = depth === 0
  const over = variance > 0
  const pct = effective > 0 ? Math.min(1.2, actual / effective) : actual > 0 ? 1.2 : 0
  const varColor =
    variance > 0 ? 'var(--color-maple)' : variance < 0 ? 'var(--color-leaf)' : 'var(--color-ink-2)'
  const ytdColor =
    ytdVariance > 0 ? 'var(--color-maple)' : ytdVariance < 0 ? 'var(--color-leaf)' : 'var(--color-ink-2)'

  return (
    <tr
      className={
        'border-b border-[var(--color-hair)] last:border-b-0 ' +
        (isParent ? 'bg-[var(--color-cream-2)]/40' : '')
      }
    >
      <td className={'py-3 pr-3 ' + (isParent ? 'pl-5' : 'pl-10')}>
        <div className="flex items-center gap-2">
          <span
            className={
              isParent
                ? 'font-serif text-[15px] text-[var(--color-ink)]'
                : 'text-[13.5px] text-[var(--color-ink-2)]'
            }
          >
            {name}
          </span>
          {rolloverEnabled && (
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-wider"
              style={{ background: 'var(--color-butter)', color: 'var(--color-ink)' }}
            >
              rollover
            </span>
          )}
        </div>
        <div className="mt-0.5 font-mono text-[10.5px] text-[var(--color-ink-3)]">{code}</div>
        {effective > 0 && (
          <div className="mt-1.5 h-1 max-w-[240px] overflow-hidden rounded-full bg-[var(--color-paper-2)]">
            <div
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
        <div className="inline-flex items-center rounded-[10px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-2 py-1 transition-colors focus-within:border-[var(--color-leaf)]">
          <span className="text-[11px] text-[var(--color-ink-3)]">$</span>
          <input
            name={`budget:${categoryId}`}
            type="text"
            inputMode="decimal"
            defaultValue={(budget / 100).toFixed(2)}
            className="w-20 bg-transparent text-right text-[13px] tabular-nums text-[var(--color-ink)] outline-none"
          />
        </div>
      </td>
      <td className="py-3 pr-3 text-right align-top tabular-nums text-[12px]">
        {rolloverEnabled ? (
          <span
            style={{
              color:
                rollover > 0
                  ? 'var(--color-leaf)'
                  : rollover < 0
                    ? 'var(--color-maple)'
                    : 'var(--color-ink-3)',
            }}
          >
            {rollover > 0 ? '+' : ''}
            {formatMoney(rollover)}
          </span>
        ) : (
          <span className="text-[var(--color-ink-3)]">—</span>
        )}
      </td>
      <td className="py-3 pr-3 text-right align-top tabular-nums text-[var(--color-ink)]">
        {formatMoney(actual)}
      </td>
      <td className="py-3 pr-3 text-right align-top tabular-nums" style={{ color: varColor }}>
        {variance === 0 ? '—' : formatMoney(variance)}
      </td>
      <td className="py-3 pr-5 text-right align-top tabular-nums text-[12.5px]" style={{ color: ytdColor }}>
        {ytdVariance === 0 ? '—' : formatMoney(ytdVariance)}
      </td>
    </tr>
  )
}
