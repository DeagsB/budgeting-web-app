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
  openingIsSuggestion: boolean
  suggestedOpeningCents: number | null
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
      className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]"
    >
      <input type="hidden" name="year" value={year} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead
            className="border-b border-[var(--color-hair)] text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]"
            style={{ background: 'var(--color-cream-2)' }}
          >
            <tr>
              <th className="px-5 py-3 font-bold">Member</th>
              <th className="px-4 py-3 font-bold">Type</th>
              <th className="px-4 py-3 text-right font-bold">Opening</th>
              <th className="px-4 py-3 text-right font-bold">Allowance</th>
              <th className="px-4 py-3 text-right font-bold">CRA limit</th>
              <th className="px-4 py-3 text-right font-bold">Contributed</th>
              <th className="px-4 py-3 text-right font-bold">Withdrawn</th>
              <th className="px-4 py-3 text-right font-bold">Available</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byMember.entries()).map(([memberId, memberRows]) => (
              <Fragment key={memberId}>
                {memberRows.map((r, i) => {
                  const allowance = r.allowanceOverride ?? r.craAllowance
                  const available = r.opening + allowance - r.contributed
                  const availColor =
                    available < 0
                      ? 'var(--color-maple)'
                      : available === 0
                        ? 'var(--color-ink-3)'
                        : 'var(--color-leaf)'
                  return (
                    <tr
                      key={`${memberId}:${r.type}`}
                      className={
                        'border-t border-[var(--color-hair)] ' +
                        (i === 0 ? 'border-t-2 border-t-[var(--color-hair)]' : '')
                      }
                    >
                      <td className="px-5 py-2.5 font-serif text-[15px] tracking-[-0.01em] text-[var(--color-ink)]">
                        {i === 0 ? r.memberName : ''}
                      </td>
                      <td className="px-4 py-2 text-[var(--color-ink-2)]">{r.typeLabel}</td>
                      <td className="px-4 py-2 text-right">
                        <input
                          name={`opening:${memberId}:${r.type}`}
                          type="text"
                          inputMode="decimal"
                          defaultValue={
                            r.openingIsSuggestion ? '' : (r.opening / 100).toFixed(2)
                          }
                          placeholder={
                            r.suggestedOpeningCents !== null
                              ? (r.suggestedOpeningCents / 100).toFixed(2)
                              : '0.00'
                          }
                          className="maple-input sm w-28 text-right tabular-nums"
                          style={
                            r.openingIsSuggestion
                              ? {
                                  borderColor: 'var(--color-honey)',
                                  background: 'var(--color-paper-2)',
                                }
                              : undefined
                          }
                          title={
                            r.openingIsSuggestion
                              ? `Suggested from prior year (${r.type === 'tfsa' ? 'TFSA withdrawals restore on Jan 1' : 'carries unused room only'})`
                              : undefined
                          }
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
                          className="maple-input sm w-28 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-3)]">
                        {formatMoney(r.craAllowance)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink)]">
                        {formatMoney(r.contributed)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-[var(--color-ink-3)]">
                        {r.withdrawn > 0 ? formatMoney(r.withdrawn) : '—'}
                      </td>
                      <td
                        className="px-4 py-2 text-right font-serif tabular-nums"
                        style={{ color: availColor }}
                      >
                        {formatMoney(available)}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center justify-between gap-3 border-t border-[var(--color-hair)] px-5 py-3"
        style={{ background: 'var(--color-cream-2)' }}
      >
        <span className="text-[11.5px] text-[var(--color-ink-3)]">
          {saved
            ? 'Saved.'
            : 'Honey-bordered inputs are suggested from prior-year data. Leave allowance blank to use the CRA default.'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save rooms'}
        </button>
      </div>
    </form>
  )
}
