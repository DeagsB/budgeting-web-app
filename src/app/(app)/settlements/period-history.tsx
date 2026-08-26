'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { MapleLabel } from '@/components/ui/label'
import { Amount } from '@/components/ui/amount'
import { formatDate } from '@/lib/format'
import { DeleteSettlementButton } from './delete-button'
import type { LineVM } from './period-card'

export type PeriodVM = {
  id: string
  period_start: string
  period_end: string | null
  status: 'open' | 'closed' | 'settled'
  closedByName: string | null
  lines: LineVM[]
  totalNetCents: number
  settlements: { id: string; fromName: string; toName: string; amount_cents: number; settled_on: string; note: string | null }[]
}

export function PeriodHistory({ periods, highlightId }: { periods: PeriodVM[]; highlightId: string | null }) {
  const [openId, setOpenId] = useState<string | null>(highlightId ?? periods[0]?.id ?? null)
  if (periods.length === 0) return <p className="px-1 text-[12.5px] text-ink-3">No closed periods yet.</p>
  return (
    <Card padding="none" className="overflow-hidden">
      <header className="border-b border-hair px-5 py-3.5">
        <MapleLabel>Past periods</MapleLabel>
      </header>
      <ul className="divide-y divide-hair">
        {periods.map((p) => {
          const expanded = openId === p.id
          return (
            <li key={p.id} id={`period-${p.id}`}>
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : p.id)}
                aria-expanded={expanded}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-3 text-left"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-[16px] text-ink">
                      {formatDate(p.period_start)} – {p.period_end ? formatDate(p.period_end) : 'today'}
                    </span>
                    <StatusPill status={p.status} />
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    {p.closedByName ? `Closed by ${p.closedByName}` : p.status === 'open' ? 'Running' : 'Closed automatically'}
                    {p.settlements.length > 0 ? ` · ${p.settlements.length} payment${p.settlements.length === 1 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <Amount cents={p.totalNetCents} tone={p.totalNetCents > 0 ? 'maple' : 'ink'} className="text-[15px]" />
                  <div className="text-[11px] text-ink-3">{p.totalNetCents > 0 ? 'outstanding' : 'settled'}</div>
                </div>
              </button>
              {expanded && (
                <div className="border-t border-hair bg-cream-2/60 px-5 py-3">
                  {p.lines.length === 0 ? (
                    <p className="text-[12.5px] text-ink-2">Nothing outstanding for this period.</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {p.lines.map((l) => (
                        <li key={`${l.from_member_id}:${l.to_member_id}`} className="flex items-center justify-between text-[13px]">
                          <span>
                            <strong className="font-semibold text-ink">{l.fromName}</strong> owes{' '}
                            <strong className="font-semibold text-ink">{l.toName}</strong>
                          </span>
                          <Amount cents={l.net_cents} tone="maple" className="text-[13px]" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {p.settlements.length > 0 && (
                    <ul className="mt-3 flex flex-col divide-y divide-hair border-t border-hair pt-1">
                      {p.settlements.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-ink">
                              <strong>{s.fromName}</strong> <span className="text-ink-3">→</span> <strong>{s.toName}</strong>
                            </div>
                            <div className="text-[11.5px] text-ink-3">
                              {formatDate(s.settled_on)}
                              {s.note ? ` · ${s.note}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Amount cents={s.amount_cents} tone="leaf" className="text-[14px]" />
                            <DeleteSettlementButton id={s.id} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function StatusPill({ status }: { status: PeriodVM['status'] }) {
  const map = {
    open: { label: 'Open', cls: 'bg-paper-2 text-ink-2' },
    closed: { label: 'Awaiting payment', cls: 'bg-paper-2 text-down' },
    settled: { label: 'Settled', cls: 'bg-leaf-soft text-leaf-deep' },
  }[status]
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${map.cls}`}>{map.label}</span>
}
