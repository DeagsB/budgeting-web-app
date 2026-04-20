'use client'

import { Fragment, useState, useTransition } from 'react'
import { formatMoney } from '@/lib/format'
import { saveContributionRooms } from './actions'

type Row = {
  member_id: string
  memberName: string
  type: 'tfsa' | 'rrsp' | 'fhsa'
  typeLabel: string
  opening: number
  allowanceOverride: number | null
  craAllowance: number
  contributed: number
  withdrawn: number
}

export function ContributionTable({ year, rows }: { year: number; rows: Row[] }) {
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  const byMember = new Map<string, Row[]>()
  for (const r of rows) {
    if (!byMember.has(r.member_id)) byMember.set(r.member_id, [])
    byMember.get(r.member_id)!.push(r)
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveContributionRooms(fd)
          setSaved(true)
          setTimeout(() => setSaved(false), 1500)
        })
      }
      className="overflow-hidden rounded-lg border border-gray-200 bg-white"
    >
      <input type="hidden" name="year" value={year} />

      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-6 py-3 font-medium">Member</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 text-right font-medium">Opening room</th>
            <th className="px-4 py-3 text-right font-medium">Allowance override</th>
            <th className="px-4 py-3 text-right font-medium">CRA limit</th>
            <th className="px-4 py-3 text-right font-medium">Contributed</th>
            <th className="px-4 py-3 text-right font-medium">Withdrawn</th>
            <th className="px-4 py-3 text-right font-medium">Available</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Array.from(byMember.entries()).map(([memberId, memberRows]) => (
            <Fragment key={memberId}>
              {memberRows.map((r, i) => {
                const allowance = r.allowanceOverride ?? r.craAllowance
                const available = r.opening + allowance - r.contributed
                const availColor =
                  available < 0
                    ? 'text-red-700'
                    : available === 0
                      ? 'text-gray-500'
                      : 'text-green-700'
                return (
                  <tr key={`${memberId}:${r.type}`} className={i === 0 ? 'border-t-2 border-gray-200' : ''}>
                    <td className="px-6 py-2 font-medium text-gray-900">
                      {i === 0 ? r.memberName : ''}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{r.typeLabel}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        name={`opening:${memberId}:${r.type}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={(r.opening / 100).toFixed(2)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        name={`allowance:${memberId}:${r.type}`}
                        type="text"
                        inputMode="decimal"
                        defaultValue={
                          r.allowanceOverride !== null
                            ? (r.allowanceOverride / 100).toFixed(2)
                            : ''
                        }
                        placeholder={(r.craAllowance / 100).toFixed(2)}
                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                      {formatMoney(r.craAllowance)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatMoney(r.contributed)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-500">
                      {r.withdrawn > 0 ? formatMoney(r.withdrawn) : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${availColor}`}>
                      {formatMoney(available)}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
        <span className="text-xs text-gray-500">
          {saved ? 'Saved.' : 'Leave allowance blank to use the CRA default.'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save rooms'}
        </button>
      </div>
    </form>
  )
}
