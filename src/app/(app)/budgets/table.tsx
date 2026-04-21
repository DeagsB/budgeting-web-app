'use client'

import { Fragment, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/format'
import { saveBudgets } from './actions'

type Category = {
  id: string
  parent_id: string | null
  name: string
  code: string
  rollover_enabled: boolean
}

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
          setTimeout(() => setSaved(false), 1500)
        })
      }
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <input type="hidden" name="month" value={month} />

      <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-3 font-medium">Category</th>
            <th className="px-4 py-3 text-right font-medium">Budgeted</th>
            <th className="px-4 py-3 text-right font-medium">Rollover</th>
            <th className="px-4 py-3 text-right font-medium">Actual</th>
            <th className="px-4 py-3 text-right font-medium">Variance</th>
            <th className="px-4 py-3 text-right font-medium">YTD variance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
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

      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
        <span className="text-xs text-gray-500">
          {saved ? 'Saved.' : 'Edit budgets and hit Save.'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save budgets'}
        </button>
      </div>
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
            rollover={r}
            rolloverEnabled={c.rollover_enabled}
            actual={a}
            variance={a - (b + r)}
            ytdVariance={
              (ytdActualRolled[c.id] ?? actualDirect[c.id] ?? 0) - (ytdBudget[c.id] ?? 0)
            }
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
  rollover: number
  rolloverEnabled: boolean
  actual: number
  variance: number
  ytdVariance: number
}) {
  const padLeft = depth === 0 ? 'pl-6' : 'pl-14'
  const varColor = variance > 0 ? 'text-red-700' : variance < 0 ? 'text-green-700' : 'text-gray-900'
  const ytdColor =
    ytdVariance > 0 ? 'text-red-700' : ytdVariance < 0 ? 'text-green-700' : 'text-gray-900'
  const rolloverColor =
    rollover > 0 ? 'text-green-700' : rollover < 0 ? 'text-red-700' : 'text-gray-400'

  return (
    <tr className={depth === 0 ? 'bg-gray-50/50' : ''}>
      <td className={`py-2 pr-4 ${padLeft}`}>
        <div className={depth === 0 ? 'font-medium text-gray-900' : 'text-gray-800'}>
          {name}
          {rolloverEnabled && (
            <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase text-gray-600">
              rollover
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-gray-400">{code}</div>
      </td>
      <td className="py-2 pr-4 text-right">
        <input
          name={`budget:${categoryId}`}
          type="text"
          inputMode="decimal"
          defaultValue={(budget / 100).toFixed(2)}
          className="w-28 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
        />
      </td>
      <td className={`py-2 pr-4 text-right tabular-nums text-xs ${rolloverColor}`}>
        {rolloverEnabled ? formatMoney(rollover) : '—'}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{formatMoney(actual)}</td>
      <td className={`py-2 pr-4 text-right tabular-nums ${varColor}`}>{formatMoney(variance)}</td>
      <td className={`py-2 pr-6 text-right tabular-nums ${ytdColor}`}>{formatMoney(ytdVariance)}</td>
    </tr>
  )
}
