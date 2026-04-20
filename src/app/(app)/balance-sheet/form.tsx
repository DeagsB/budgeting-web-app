'use client'

import { useState, useTransition } from 'react'
import { formatMoney } from '@/lib/format'
import { saveBalances } from './actions'

type AccountRow = {
  id: string
  name: string
  type: string
  typeLabel: string
  memberName: string | null
  ownership: string
  opening_balance_cents: number
  current_balance_cents: number | null
  previous_balance_cents: number | null
  is_liability: boolean
}

export function BalanceSheetForm({
  month,
  accounts,
}: {
  month: string
  accounts: AccountRow[]
}) {
  const assetAccounts = accounts.filter((a) => !a.is_liability)
  const liabilityAccounts = accounts.filter((a) => a.is_liability)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveBalances(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        })
      }
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="month" value={month} />

      <Section title="Assets" accounts={assetAccounts} />
      <Section title="Liabilities" accounts={liabilityAccounts} />

      <div className="flex items-center justify-end gap-3">
        <span className="text-xs text-gray-500">{saved ? 'Saved.' : ''}</span>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save balances'}
        </button>
      </div>
    </form>
  )
}

function Section({ title, accounts }: { title: string; accounts: AccountRow[] }) {
  if (accounts.length === 0) return null
  const sum = accounts.reduce(
    (s, a) => s + (a.current_balance_cents ?? a.opening_balance_cents),
    0,
  )
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-gray-200 px-6 py-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">{title}</h2>
        <span className="text-sm tabular-nums text-gray-900">{formatMoney(sum)}</span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-2 font-medium">Account</th>
            <th className="px-4 py-2 text-right font-medium">Previous month</th>
            <th className="px-4 py-2 text-right font-medium">This month</th>
            <th className="px-4 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map((a) => {
            const current = a.current_balance_cents
            const prev = a.previous_balance_cents ?? a.opening_balance_cents
            const effective = current ?? a.opening_balance_cents
            const change = effective - prev
            const color =
              change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-gray-500'
            return (
              <tr key={a.id}>
                <td className="px-6 py-2">
                  <div className="font-medium text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-500">
                    {a.typeLabel}
                    {' · '}
                    {a.ownership === 'shared' ? 'Shared' : (a.memberName ?? 'Member removed')}
                  </div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                  {formatMoney(prev)}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`bal:${a.id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={current !== null ? (current / 100).toFixed(2) : ''}
                    placeholder={(a.opening_balance_cents / 100).toFixed(2)}
                    className="w-32 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                  />
                </td>
                <td className={`px-4 py-2 text-right tabular-nums ${color}`}>
                  {formatMoney(change)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
