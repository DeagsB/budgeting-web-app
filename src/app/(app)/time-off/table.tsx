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
      className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]"
    >
      <input type="hidden" name="period_month" value={month} />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13.5px]">
          <thead
            className="border-b border-[var(--color-hair)] text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]"
            style={{ background: 'var(--color-cream-2)' }}
          >
            <tr>
              <th className="px-5 py-3 font-bold" rowSpan={2}>
                Member
              </th>
              <th className="px-4 py-2 text-center font-bold" colSpan={3}>
                Vacation
              </th>
              <th className="px-4 py-2 text-center font-bold" colSpan={3}>
                FLEX
              </th>
            </tr>
            <tr>
              <th className="px-4 py-2 text-right font-bold">Accrued</th>
              <th className="px-4 py-2 text-right font-bold">Used</th>
              <th className="px-4 py-2 text-right font-bold">Balance</th>
              <th className="px-4 py-2 text-right font-bold">Accrued</th>
              <th className="px-4 py-2 text-right font-bold">Used</th>
              <th className="px-4 py-2 text-right font-bold">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member_id} className="border-t border-[var(--color-hair)]">
                <td className="px-5 py-2.5 font-serif text-[15px] tracking-[-0.01em] text-[var(--color-ink)]">
                  {r.memberName}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`vac_acc:${r.member_id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={r.vacation_accrued.toFixed(2)}
                    className="maple-input sm w-20 text-right tabular-nums"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`vac_use:${r.member_id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={r.vacation_used.toFixed(2)}
                    className="maple-input sm w-20 text-right tabular-nums"
                  />
                </td>
                <td
                  className="px-4 py-2 text-right font-serif tabular-nums"
                  style={{
                    color:
                      r.vacation_balance < 0 ? 'var(--color-maple)' : 'var(--color-ink)',
                  }}
                >
                  {fmtHours(r.vacation_balance)}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`flex_acc:${r.member_id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={r.flex_accrued.toFixed(2)}
                    className="maple-input sm w-20 text-right tabular-nums"
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    name={`flex_use:${r.member_id}`}
                    type="text"
                    inputMode="decimal"
                    defaultValue={r.flex_used.toFixed(2)}
                    className="maple-input sm w-20 text-right tabular-nums"
                  />
                </td>
                <td
                  className="px-4 py-2 text-right font-serif tabular-nums"
                  style={{
                    color: r.flex_balance < 0 ? 'var(--color-maple)' : 'var(--color-ink)',
                  }}
                >
                  {fmtHours(r.flex_balance)}
                </td>
              </tr>
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
            : 'Enter hours for this month. Balances roll up across all prior months.'}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save hours'}
        </button>
      </div>
    </form>
  )
}
