'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { MapleLabel } from '@/components/ui/label'
import { Amount } from '@/components/ui/amount'
import { formatDate, formatMoney } from '@/lib/format'
import type { NetBalance } from '@/lib/settlement'
import { closePeriodNow, markPeriodSettled } from './actions'

export type LineVM = NetBalance & { fromName: string; toName: string; involvesMe: boolean }

const MONTH_DAY = new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' })

/** "Sep 28" for a YYYY-MM-DD civil date. */
function formatMonthDay(isoDate: string): string {
  return MONTH_DAY.format(new Date(isoDate + 'T00:00:00'))
}

/** 1 -> "1st", 22 -> "22nd", 13 -> "13th". */
function ordinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const suffix = n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

/** The running tally: what is owed right now, and the button to close early. */
export function OpenPeriodCard({
  periodStart,
  today,
  lines,
  carryForward,
  nextAutoClose,
  closeDay,
}: {
  periodStart: string
  today: string
  lines: LineVM[]
  carryForward: LineVM[]
  nextAutoClose: string
  closeDay: number
}) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const carryTotal = carryForward.reduce((s, l) => s + l.net_cents, 0)

  return (
    <Card padding="lg">
      <div className="flex items-baseline justify-between gap-3">
        <MapleLabel>Running tally</MapleLabel>
        <span className="text-[12px] text-ink-3">
          {periodStart > today ? `New period starts ${formatMonthDay(periodStart)}` : `Open since ${formatDate(periodStart)}`}
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="mt-3 rounded-md bg-leaf-soft px-4 py-3 text-[13.5px] leading-relaxed text-leaf">All square so far. Shared expenses land here as they happen.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {lines.map((l) => (
            <Line key={`${l.from_member_id}:${l.to_member_id}`} line={l} />
          ))}
        </ul>
      )}
      {carryTotal > 0 && (
        <p className="mt-2 text-[12px] text-ink-3">Includes {formatMoney(carryTotal)} carried forward from earlier periods.</p>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[12.5px] text-ink-2">
          Closes {formatMonthDay(nextAutoClose)} · every month on the {ordinal(closeDay)}
        </span>
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirm(true)} className="shrink-0">
          Close period now
        </Button>
      </div>
      {error && <p className="mt-2 text-[12.5px] font-medium text-maple">{error}</p>}

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Close the period today?">
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            Everything shared up to today goes into a statement you can settle in one tap. New shared expenses start the next period, and the usual day-{closeDay} close is skipped this month.
          </p>
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await closePeriodNow()
                  if (res && 'error' in res) setError(res.error)
                  else router.refresh()
                  setConfirm(false)
                })
              }
            >
              {pending ? 'Closing…' : 'Close period'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </Card>
  )
}

/** A closed statement waiting for payment; one tap records it. */
export function AwaitingSettlementCard({
  periodId,
  periodStart,
  periodEnd,
  lines,
  onRecordDifferent,
}: {
  periodId: string
  periodStart: string
  periodEnd: string
  lines: LineVM[]
  onRecordDifferent?: () => void
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <Card padding="lg" className="border-honey">
      <div className="flex items-baseline justify-between gap-3">
        <MapleLabel>Awaiting settlement</MapleLabel>
        <span className="text-[12px] text-ink-3">
          {formatDate(periodStart)} – {formatDate(periodEnd)}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {lines.map((l) => (
          <Line key={`${l.from_member_id}:${l.to_member_id}`} line={l} />
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          action={() =>
            start(async () => {
              const fd = new FormData()
              fd.set('period_id', periodId)
              const res = await markPeriodSettled(fd)
              if (res && 'error' in res) setError(res.error)
              else router.refresh()
            })
          }
        >
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Recording…' : 'Mark settled'}
          </Button>
        </form>
        {onRecordDifferent && (
          <Button type="button" variant="ghost" onClick={onRecordDifferent}>
            Record a different amount
          </Button>
        )}
      </div>
      <p className="mt-2 text-[12px] text-ink-3">Records one payment per line, dated today. Delete a payment below to reopen.</p>
      {error && <p className="mt-2 text-[12.5px] font-medium text-maple">{error}</p>}
    </Card>
  )
}

function Line({ line }: { line: LineVM }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-[13.5px] ${line.involvesMe ? 'bg-cream-2' : 'bg-paper-2/60'}`}>
      <span className="min-w-0 truncate">
        <strong className="font-semibold text-ink">{line.fromName}</strong> <span className="text-ink-2">owes</span>{' '}
        <strong className="font-semibold text-ink">{line.toName}</strong>
      </span>
      <span className="shrink-0 rounded-full bg-maple-soft px-2.5 py-1">
        <Amount cents={line.net_cents} tone="maple" className="text-[14px]" />
      </span>
    </li>
  )
}
