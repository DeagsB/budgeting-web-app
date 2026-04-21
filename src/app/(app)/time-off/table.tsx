'use client'

import { useState, useTransition } from 'react'
import { saveTimeOff } from './actions'

type Row = {
  member_id: string
  memberName: string
  vacation_accrued: number
  vacation_used: number
  flex_accrued: number
  flex_used: number
  vacation_balance: number
  flex_balance: number
}

function fmtHours(h: number): string {
  return `${h.toFixed(2)} h`
}

export function TimeOffTable({ month, rows }: { month: string; rows: Row[] }) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveTimeOff(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        })
      }
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <input type="hidden" name="period_month" value={month} />

      <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-3 font-medium" rowSpan={2}>
              Member
            </th>
            <th className="px-4 py-2 text-center font-medium" colSpan={3}>
              Vacation
            </th>
            <th className="px-4 py-2 text-center font-medium" colSpan={3}>
              FLEX
            </th>
          </tr>
          <tr>
            <th className="px-4 py-2 text-right font-medium">Accrued</th>
            <th className="px-4 py-2 text-right font-medium">Used</th>
            <th className="px-4 py-2 text-right font-medium">Balance (cum.)</th>
            <th className="px-4 py-2 text-right font-medium">Accrued</th>
            <th className="px-4 py-2 text-right font-medium">Used</th>
            <th className="px-4 py-2 text-right font-medium">Balance (cum.)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.member_id}>
              <td className="px-6 py-2 font-medium text-gray-900">{r.memberName}</td>
              <td className="px-4 py-2 text-right">
                <input
                  name={`vac_acc:${r.member_id}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={r.vacation_accrued.toFixed(2)}
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input
                  name={`vac_use:${r.member_id}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={r.vacation_used.toFixed(2)}
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                />
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${r.vacation_balance < 0 ? 'text-red-700' : 'text-gray-900'}`}
              >
                {fmtHours(r.vacation_balance)}
              </td>
              <td className="px-4 py-2 text-right">
                <input
                  name={`flex_acc:${r.member_id}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={r.flex_accrued.toFixed(2)}
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                />
              </td>
              <td className="px-4 py-2 text-right">
                <input
                  name={`flex_use:${r.member_id}`}
                  type="text"
                  inputMode="decimal"
                  defaultValue={r.flex_used.toFixed(2)}
                  className="w-20 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                />
              </td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${r.flex_balance < 0 ? 'text-red-700' : 'text-gray-900'}`}
              >
                {fmtHours(r.flex_balance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
        <span className="text-xs text-gray-500">
          {saved ? 'Saved.' : 'Enter hours for this month. Balances roll up across all prior months.'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save hours'}
        </button>
      </div>
    </form>
  )
}
