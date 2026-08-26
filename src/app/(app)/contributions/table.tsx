'use client'

import { Fragment, useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { MapleLabel } from '@/components/ui/label'
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

type SaveStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string }

/** Derived per-row figures shared by the mobile cards and the desktop table. */
function derive(r: Row) {
  const allowance = r.allowanceOverride ?? r.craAllowance
  const room = r.opening + allowance
  const available = room - r.contributed
  // Fraction of room used. Cap the bar fill at 100% but track over-contribution
  // separately so we can surface "over by $X".
  const pct = room > 0 ? r.contributed / room : r.contributed > 0 ? 1 : 0
  return { allowance, room, available, pct, over: available < 0 }
}

/**
 * Maple contribution-room editor.
 *
 * The screen's job is "how much registered room is left", so the primary
 * (mobile) layout is a per-member stack of cards: each account type gets a
 * contributed-vs-room progress bar with an "available" caption. The dense
 * spreadsheet table is reserved for `sm:`+ inside a <DataTable> so the page
 * never scrolls horizontally on phones.
 *
 * Both layouts share one <form>; a single Save commits whatever is on screen.
 * The save bar reports honestly — green "Saved" only when the server action
 * returns ok — inside an aria-live region.
 */
export function ContributionTable({ year, rows }: { year: number; rows: Row[] }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })

  const byMember = new Map<string, Row[]>()
  for (const r of rows) {
    if (!byMember.has(r.member_id)) byMember.set(r.member_id, [])
    byMember.get(r.member_id)!.push(r)
  }
  const members = Array.from(byMember.entries())

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await saveContributionRooms(fd)
          if (result.ok) {
            setStatus({ kind: 'saved' })
            setTimeout(() => setStatus({ kind: 'idle' }), 2500)
          } else {
            setStatus({ kind: 'error', message: result.error })
          }
        })
      }
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="year" value={year} />

      {/* ── Mobile: per-member card stack with room progress (primary) ── */}
      <div className="flex flex-col gap-4 sm:hidden">
        {members.map(([memberId, memberRows]) => (
          <div
            key={memberId}
            className="overflow-hidden rounded-lg border border-hair bg-paper shadow-[var(--shadow-card)]"
          >
            <header className="border-b border-hair bg-cream-2 px-4 py-3">
              <h2 className="font-serif text-[17px] tracking-[-0.01em] text-ink">
                {memberRows[0]?.memberName}
              </h2>
            </header>
            {memberRows.map((r) => (
              <RoomCard key={`${memberId}:${r.type}`} memberId={memberId} row={r} />
            ))}
          </div>
        ))}
      </div>

      {/* ── Desktop: dense table (sm:+) ── */}
      <div className="hidden overflow-hidden rounded-lg border border-hair bg-paper shadow-[var(--shadow-card)] sm:block">
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
          <MapleLabel>Registered room</MapleLabel>
          <span className="text-[11px] text-ink-3">Edit opening / room this year, then save</span>
        </header>
        <DataTable minWidth={820}>
          <caption className="sr-only">Registered contribution room by member and account type for {year}</caption>
          <thead>
            <tr className="border-b border-hair text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              <th scope="col" className="px-5 py-3">Member</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3 text-right">Opening</th>
              <th scope="col" className="px-4 py-3 text-right">Room this year</th>
              <th scope="col" className="px-4 py-3 text-right">CRA limit</th>
              <th scope="col" className="px-4 py-3 text-right">Contributed</th>
              <th scope="col" className="px-4 py-3 text-right">Withdrawn</th>
              <th scope="col" className="px-4 py-3 text-right">Available</th>
            </tr>
          </thead>
          <tbody>
            {members.map(([memberId, memberRows]) => (
              <Fragment key={memberId}>
                {memberRows.map((r, i) => (
                  <TableRow
                    key={`${memberId}:${r.type}`}
                    memberId={memberId}
                    row={r}
                    first={i === 0}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </DataTable>
      </div>

      {/* ── Sticky save bar (above the bottom tab bar on mobile) ── */}
      <div className="sticky bottom-[calc(72px+env(safe-area-inset-bottom))] z-10 flex flex-col gap-3 rounded-lg border border-hair bg-cream-2 px-4 py-3 shadow-[var(--shadow-float)] sm:bottom-3 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-w-0 flex-1 text-[12px]">
          {status.kind === 'saved' ? (
            <span className="font-semibold text-leaf">✓ Saved</span>
          ) : status.kind === 'error' ? (
            <span className="font-semibold text-maple">{status.message}</span>
          ) : (
            <span className="text-ink-3">
              Honey-bordered inputs are suggested from prior-year data. Leave allowance blank to use
              the CRA default.
            </span>
          )}
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={pending} className="shrink-0">
          {pending ? 'Saving…' : 'Save rooms'}
        </Button>
      </div>
    </form>
  )
}

function OpeningInput({ memberId, row }: { memberId: string; row: Row }) {
  return (
    <input
      name={`opening:${memberId}:${row.type}`}
      type="text"
      inputMode="decimal"
      aria-label={`${row.typeLabel} opening room for ${row.memberName}`}
      defaultValue={row.openingIsSuggestion ? '' : (row.opening / 100).toFixed(2)}
      placeholder={
        row.suggestedOpeningCents !== null
          ? (row.suggestedOpeningCents / 100).toFixed(2)
          : '0.00'
      }
      className={`maple-input sm w-full text-right tabular-nums ${
        row.openingIsSuggestion ? 'border-honey bg-paper-2' : ''
      }`}
      title={
        row.openingIsSuggestion
          ? `Suggested from prior year (${row.type === 'tfsa' ? 'TFSA withdrawals restore on Jan 1' : 'carries unused room only'})`
          : undefined
      }
    />
  )
}

function AllowanceInput({ memberId, row }: { memberId: string; row: Row }) {
  return (
    <input
      name={`allowance:${memberId}:${row.type}`}
      type="text"
      inputMode="decimal"
      aria-label={`${row.typeLabel} room this year for ${row.memberName} - your Notice of Assessment figure`}
      defaultValue={row.allowanceOverride !== null ? (row.allowanceOverride / 100).toFixed(2) : ''}
      placeholder={(row.craAllowance / 100).toFixed(2)}
      className="maple-input sm w-full text-right tabular-nums"
    />
  )
}

// ── Mobile card: one registered account type for one member ──
function RoomCard({ memberId, row }: { memberId: string; row: Row }) {
  const { room, available, pct, over } = derive(row)
  const fill = Math.min(100, Math.round(pct * 100))

  return (
    <div className="border-b border-hair p-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-serif text-[16px] tracking-[-0.01em] text-ink">{row.typeLabel}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">
            CRA limit {formatMoney(row.craAllowance)}
          </div>
        </div>
        <div className="text-right">
          {over ? (
            <div className="text-[12px] font-semibold text-maple">
              over by <Amount cents={Math.abs(available)} tone="maple" className="text-[12px]" />
            </div>
          ) : (
            <div className="text-[12px] text-ink-3">
              available{' '}
              <Amount cents={available} tone="leaf" className="text-[12px]" />
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-cream-2"
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${row.typeLabel} room used for ${row.memberName}${over ? ', over contributed' : ''}`}
      >
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-maple' : 'bg-leaf'}`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-ink-3">
        <span>
          Contributed <Amount cents={row.contributed} className="text-[11.5px] text-ink-2" /> of{' '}
          {formatMoney(room)}
        </span>
        {row.withdrawn > 0 ? <span>Withdrawn {formatMoney(row.withdrawn)}</span> : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Opening (Jan 1)
          </span>
          <OpeningInput memberId={memberId} row={row} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Room this year
          </span>
          <AllowanceInput memberId={memberId} row={row} />
        </label>
      </div>
    </div>
  )
}

// ── Desktop table row ──
function TableRow({ memberId, row, first }: { memberId: string; row: Row; first: boolean }) {
  const { available, over } = derive(row)
  const availTone = over ? 'maple' : available === 0 ? 'ink' : 'leaf'

  return (
    <tr className={'border-t border-hair ' + (first ? 'border-t-2' : '')}>
      <td className="px-5 py-2.5 font-serif text-[15px] tracking-[-0.01em] text-ink">
        {first ? row.memberName : ''}
      </td>
      <td className="px-4 py-2 text-ink-2">{row.typeLabel}</td>
      <td className="px-4 py-2 text-right">
        <div className="inline-block w-28">
          <OpeningInput memberId={memberId} row={row} />
        </div>
      </td>
      <td className="px-4 py-2 text-right">
        <div className="inline-block w-28">
          <AllowanceInput memberId={memberId} row={row} />
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-ink-3">
        {formatMoney(row.craAllowance)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-ink">{formatMoney(row.contributed)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-ink-3">
        {row.withdrawn > 0 ? formatMoney(row.withdrawn) : '—'}
      </td>
      <td className="px-4 py-2 text-right">
        <Amount cents={available} tone={availTone} />
        {over ? (
          <span className="ml-1 text-[11px] font-semibold text-maple">over</span>
        ) : null}
      </td>
    </tr>
  )
}
