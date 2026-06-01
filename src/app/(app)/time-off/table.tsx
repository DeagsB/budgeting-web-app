'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
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

/** Renders a cumulative balance with a non-color "overdrawn" cue when negative. */
function Balance({ hours, label }: { hours: number; label: string }) {
  const over = hours < 0
  return (
    <span
      className={`font-serif tabular-nums ${over ? 'text-maple' : 'text-ink'}`}
      aria-label={`${label} balance ${fmtHours(hours)}${over ? ', overdrawn' : ''}`}
    >
      {fmtHours(hours)}
      {over ? (
        <span className="ml-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-maple">
          overdrawn
        </span>
      ) : null}
    </span>
  )
}

function HoursInput({
  name,
  defaultValue,
  ariaLabel,
}: {
  name: string
  defaultValue: number
  ariaLabel: string
}) {
  return (
    <input
      name={name}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      defaultValue={defaultValue.toFixed(2)}
      className="maple-input sm w-full text-right tabular-nums sm:w-20"
    />
  )
}

export function TimeOffTable({ month, rows }: { month: string; rows: Row[] }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null)

  function onSubmit(fd: FormData) {
    startTransition(async () => {
      const result = await saveTimeOff(fd)
      if (result.ok) {
        setStatus({ ok: true, msg: 'Saved.' })
        setTimeout(() => setStatus(null), 2500)
      } else {
        setStatus({ ok: false, msg: result.error })
      }
    })
  }

  return (
    <form
      action={onSubmit}
      className="overflow-hidden rounded-xl border border-hair bg-paper shadow-[var(--shadow-card)]"
    >
      <input type="hidden" name="period_month" value={month} />

      {/* Mobile: stacked per-member cards */}
      <div className="flex flex-col divide-y divide-hair md:hidden">
        {rows.map((r) => (
          <fieldset key={r.member_id} className="flex flex-col gap-3 px-4 py-4">
            <legend className="font-serif text-[17px] tracking-[-0.01em] text-ink">
              {r.memberName}
            </legend>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2 rounded-lg border border-hair bg-cream-2 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                    Vacation
                  </span>
                  <Balance hours={r.vacation_balance} label={`${r.memberName} vacation`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Accrued
                    </span>
                    <HoursInput
                      name={`vac_acc:${r.member_id}`}
                      defaultValue={r.vacation_accrued}
                      ariaLabel={`${r.memberName} vacation accrued hours`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Used
                    </span>
                    <HoursInput
                      name={`vac_use:${r.member_id}`}
                      defaultValue={r.vacation_used}
                      ariaLabel={`${r.memberName} vacation used hours`}
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-hair bg-cream-2 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                    FLEX
                  </span>
                  <Balance hours={r.flex_balance} label={`${r.memberName} FLEX`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Accrued
                    </span>
                    <HoursInput
                      name={`flex_acc:${r.member_id}`}
                      defaultValue={r.flex_accrued}
                      ariaLabel={`${r.memberName} FLEX accrued hours`}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                      Used
                    </span>
                    <HoursInput
                      name={`flex_use:${r.member_id}`}
                      defaultValue={r.flex_used}
                      ariaLabel={`${r.memberName} FLEX used hours`}
                    />
                  </label>
                </div>
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      {/* Desktop: wide table with a sticky Member column */}
      <div className="hidden md:block">
        <DataTable minWidth={760}>
          <thead className="text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 bg-cream-2">
            <tr>
              <th
                className="sticky left-0 z-10 bg-cream-2 px-5 py-3 font-bold"
                rowSpan={2}
                scope="col"
              >
                Member
              </th>
              <th className="px-4 py-2 text-center font-bold" colSpan={3} scope="colgroup">
                Vacation
              </th>
              <th className="px-4 py-2 text-center font-bold" colSpan={3} scope="colgroup">
                FLEX
              </th>
            </tr>
            <tr>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Accrued
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Used
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Balance
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Accrued
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Used
              </th>
              <th className="px-4 py-2 text-right font-bold" scope="col">
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member_id} className="border-t border-hair">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-paper px-5 py-2.5 text-left font-serif text-[15px] font-normal tracking-[-0.01em] text-ink"
                >
                  {r.memberName}
                </th>
                <td className="px-4 py-2 text-right">
                  <HoursInput
                    name={`vac_acc:${r.member_id}`}
                    defaultValue={r.vacation_accrued}
                    ariaLabel={`${r.memberName} vacation accrued hours`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <HoursInput
                    name={`vac_use:${r.member_id}`}
                    defaultValue={r.vacation_used}
                    ariaLabel={`${r.memberName} vacation used hours`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Balance hours={r.vacation_balance} label={`${r.memberName} vacation`} />
                </td>
                <td className="px-4 py-2 text-right">
                  <HoursInput
                    name={`flex_acc:${r.member_id}`}
                    defaultValue={r.flex_accrued}
                    ariaLabel={`${r.memberName} FLEX accrued hours`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <HoursInput
                    name={`flex_use:${r.member_id}`}
                    defaultValue={r.flex_used}
                    ariaLabel={`${r.memberName} FLEX used hours`}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <Balance hours={r.flex_balance} label={`${r.memberName} FLEX`} />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="flex flex-col gap-3 border-t border-hair bg-cream-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p
          aria-live="polite"
          className={`text-[12px] ${
            status?.ok === false ? 'font-medium text-maple' : 'text-ink-3'
          }`}
        >
          {status
            ? status.msg
            : 'Enter hours for this month. Balances roll up across all prior months.'}
        </p>
        <Button type="submit" variant="primary" size="md" disabled={pending}>
          {pending ? 'Saving…' : 'Save hours'}
        </Button>
      </div>
    </form>
  )
}
