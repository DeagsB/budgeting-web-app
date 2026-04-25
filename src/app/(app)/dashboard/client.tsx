'use client'

import { useMemo, useState } from 'react'
import { formatMoney, monthLabel } from '@/lib/format'
import { smoothPath, seriesToPoints } from '@/lib/maple'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
import { Reveal } from '@/components/ui/reveal'
import { PrivacyBlur } from '@/components/ui/privacy-blur'
import { useCountUp } from '@/components/ui/count-up'
import { colorForCategory } from '@/lib/category-colors'

type MemberVM = { id: string; name: string; initial: string }
type AccountVM = {
  id: string
  name: string
  type: AccountType
  ownership: string
  member_id: string | null
  balance_cents: number
  month_outflow_cents: number
  month_inflow_cents: number
  month_tx_count: number
}
type TrailPoint = { month: string; value: number }
type SpendBucket = { id: string; name: string; amount_cents: number }

const RANGES = [
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: 'YTD', months: 0 },
  { id: '1Y', months: 12 },
  { id: 'ALL', months: 999 },
] as const
type RangeId = (typeof RANGES)[number]['id']

/**
 * Full CAD formatter — always show the real number on the hero. Abbreviation
 * belongs on axes, not on the primary balance.
 */
const CAD_FULL = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const CAD_COMPACT = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})
const fmtCAD = (cents: number, compact = false) =>
  (compact ? CAD_COMPACT : CAD_FULL).format(cents / 100)
const fmtSignedCAD = (cents: number, compact = false) => {
  const s = (compact ? CAD_COMPACT : CAD_FULL).format(Math.abs(cents) / 100)
  return cents >= 0 ? `+${s}` : `−${s}`
}

export function DashboardClient({
  householdName: _householdName,
  members,
  currentMonthISO,
  netWorth,
  netWorthDelta,
  netWorthTrail,
  income,
  expenses,
  net,
  accounts,
  spendingBreakdown,
}: {
  householdName: string
  members: MemberVM[]
  currentMonthISO: string
  netWorth: number
  netWorthDelta: number
  netWorthTrail: TrailPoint[]
  income: number
  expenses: number
  net: number
  accounts: AccountVM[]
  spendingBreakdown: SpendBucket[]
}) {
  const [hidden, setHidden] = useState(false)
  const [range, setRange] = useState<RangeId>('1Y')
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  const animatedNet = useCountUp(netWorth, { duration: 1100 })

  const filteredTrail = useMemo(() => {
    if (range === 'ALL') return netWorthTrail
    if (range === 'YTD') {
      const year = currentMonthISO.slice(0, 4)
      return netWorthTrail.filter((p) => p.month >= `${year}-01-01`)
    }
    const keep = RANGES.find((r) => r.id === range)?.months ?? 12
    return netWorthTrail.slice(Math.max(0, netWorthTrail.length - keep - 1))
  }, [netWorthTrail, range, currentMonthISO])

  const chartW = 640
  const chartH = 150
  const chartPoints = useMemo(
    () =>
      seriesToPoints(filteredTrail.map((p) => p.value), chartW, chartH, { pad: 10 }),
    [filteredTrail],
  )
  const chartPath = useMemo(() => smoothPath(chartPoints), [chartPoints])
  const chartArea =
    chartPoints.length > 1
      ? `${chartPath} L${chartPoints[chartPoints.length - 1][0]},${chartH} L${chartPoints[0][0]},${chartH} Z`
      : ''

  const handleScrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const idx = Math.round(xFrac * (filteredTrail.length - 1))
    setScrubIdx(idx)
  }

  const scrubPoint = scrubIdx !== null ? filteredTrail[scrubIdx] : null
  const displayedValue = scrubPoint ? scrubPoint.value : animatedNet
  const displayedLabel = scrubPoint ? monthLabel(scrubPoint.month) : 'vs last month'
  const deltaUp = netWorthDelta >= 0

  const firstName = members[0]?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* ───────── Greeting ───────── */}
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            {monthLabel(currentMonthISO)}
          </div>
          <h1 className="mt-1 font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
            Bonjour, {firstName}.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] text-[var(--color-ink-2)] transition-all active:scale-95"
          >
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <div className="flex">
            {members.slice(0, 3).map((m, i) => (
              <div
                key={m.id}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--color-cream)] font-serif text-[15px] text-[var(--color-ink)]"
                style={{
                  background: ['var(--color-leaf-soft)', 'var(--color-maple-soft)', 'var(--color-butter)'][i] ?? 'var(--color-butter)',
                  marginLeft: i === 0 ? 0 : -10,
                  zIndex: 10 - i,
                }}
              >
                {m.initial.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ───────── Net-worth hero ─────────
          KEY FIX: paper-cream card, ink-black serif number, delicate leaf
          area chart. NOT a solid green block with an invisible chart. */}
      <Reveal>
        <section className="overflow-hidden rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-card)] md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <MapleLabel>Net worth</MapleLabel>
              <div className="mt-2 font-serif text-[56px] leading-none tracking-[-0.03em] tabular-nums text-[var(--color-ink)] md:text-[72px]">
                <PrivacyBlur hidden={hidden}>{fmtCAD(displayedValue)}</PrivacyBlur>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[13px]">
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums"
                  style={{
                    background: deltaUp ? 'var(--color-leaf-soft)' : 'var(--color-maple-soft)',
                    color: deltaUp ? 'var(--color-leaf)' : 'var(--color-maple)',
                  }}
                >
                  <PrivacyBlur hidden={hidden}>
                    {scrubPoint ? fmtCAD(scrubPoint.value) : fmtSignedCAD(netWorthDelta)}
                  </PrivacyBlur>
                </span>
                <span className="text-[var(--color-ink-2)]">{displayedLabel}</span>
              </div>
            </div>
            {/* Range selector */}
            <div className="hidden gap-0.5 rounded-full bg-[var(--color-paper-2)] p-1 sm:flex">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={
                    'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ' +
                    (range === r.id
                      ? 'bg-[var(--color-paper)] text-[var(--color-ink)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-[var(--color-ink-2)] hover:text-[var(--color-ink)]')
                  }
                >
                  {r.id}
                </button>
              ))}
            </div>
          </div>

          {/* Area chart */}
          <div className="relative mt-5 -mx-1">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="block h-[150px] w-full cursor-crosshair touch-none"
              onPointerMove={handleScrub}
              onPointerLeave={() => setScrubIdx(null)}
            >
              <defs>
                <linearGradient id="netWorthArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-leaf)" stopOpacity="0.20" />
                  <stop offset="100%" stopColor="var(--color-leaf)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {/* baseline */}
              <line
                x1="0"
                x2={chartW}
                y1={chartH - 1}
                y2={chartH - 1}
                stroke="var(--color-hair)"
                strokeWidth="1"
              />
              {chartArea && <path d={chartArea} fill="url(#netWorthArea)" />}
              {chartPath && (
                <path
                  d={chartPath}
                  fill="none"
                  stroke="var(--color-leaf)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              {scrubIdx !== null && chartPoints[scrubIdx] && (
                <g>
                  <line
                    x1={chartPoints[scrubIdx][0]}
                    x2={chartPoints[scrubIdx][0]}
                    y1={0}
                    y2={chartH}
                    stroke="var(--color-ink-3)"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />
                  <circle
                    cx={chartPoints[scrubIdx][0]}
                    cy={chartPoints[scrubIdx][1]}
                    r="5"
                    fill="var(--color-paper)"
                    stroke="var(--color-leaf)"
                    strokeWidth="2.5"
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Mobile range selector */}
          <div className="mt-3 flex gap-1 sm:hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={
                  'flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-all ' +
                  (range === r.id
                    ? 'bg-[var(--color-paper-2)] text-[var(--color-ink)]'
                    : 'text-[var(--color-ink-2)]')
                }
              >
                {r.id}
              </button>
            ))}
          </div>
        </section>
      </Reveal>

      {/* ───────── Month stats ───────── */}
      <section className="grid grid-cols-3 gap-3">
        {[
          { label: 'Income', value: income, color: 'var(--color-leaf)' },
          { label: 'Spent', value: expenses, color: 'var(--color-maple)' },
          { label: 'Saved', value: net, color: net >= 0 ? 'var(--color-leaf)' : 'var(--color-maple)', signed: true },
        ].map((s, i) => (
          <Reveal key={s.label} delay={120 + i * 60}>
            <div className="rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4 md:p-5">
              <MapleLabel>{s.label}</MapleLabel>
              <div
                className="mt-1.5 whitespace-nowrap font-serif text-[20px] leading-tight tracking-[-0.02em] tabular-nums md:text-[26px]"
                style={{ color: s.color }}
              >
                <PrivacyBlur hidden={hidden}>
                  {/* Mobile drops cents so the negative-sign edge case
                      doesn't push the value past the narrow grid column. */}
                  <span className="md:hidden">
                    {s.signed ? fmtSignedCAD(s.value, true) : fmtCAD(Math.abs(s.value), true)}
                  </span>
                  <span className="hidden md:inline">
                    {s.signed ? fmtSignedCAD(s.value) : fmtCAD(Math.abs(s.value))}
                  </span>
                </PrivacyBlur>
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* ───────── Accounts ───────── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Accounts</MapleLabel>
          <a href="/accounts" className="text-[12px] font-semibold text-[var(--color-leaf)] hover:underline">
            See all →
          </a>
        </div>
        {accounts.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper-2)] p-6 text-[14px] text-[var(--color-ink-2)]">
            No accounts yet.{' '}
            <a href="/accounts" className="font-semibold text-[var(--color-leaf)] underline">
              Add one
            </a>
            .
          </div>
        ) : (
          <div className="hide-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:px-0 md:overflow-visible">
            {accounts.slice(0, 6).map((a, i) => {
              const isFlipped = !!flipped[a.id]
              const isLiability = LIABILITY_TYPES.has(a.type)
              const display = Math.abs(a.balance_cents)
              const negative = a.balance_cents < 0 || isLiability
              // Month-stat helpers for the card-flip back face. Net change
              // is positive when more money came in than went out.
              const monthNet = a.month_inflow_cents - a.month_outflow_cents
              const isLoan = a.type === 'loan' || a.type === 'credit_card'
              return (
                <Reveal key={a.id} delay={220 + i * 50}>
                  <button
                    type="button"
                    onClick={() => setFlipped((f) => ({ ...f, [a.id]: !f[a.id] }))}
                    className="block w-[240px] shrink-0 snap-start text-left md:w-full"
                    style={{ perspective: 1200 }}
                  >
                    <div
                      className="relative h-[150px] w-full"
                      style={{
                        transformStyle: 'preserve-3d',
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                        transition: 'transform 600ms var(--ease-ios)',
                      }}
                    >
                      {/* front — cream card */}
                      <div
                        className="absolute inset-0 flex flex-col rounded-[18px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4"
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                            {accountTypeLabel(a.type)}
                          </div>
                          <div
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: a.ownership === 'shared' ? 'var(--color-maple)' : 'var(--color-leaf)' }}
                          />
                        </div>
                        <div className="mt-2 text-[14px] font-medium text-[var(--color-ink)]">{a.name}</div>
                        <div
                          className="mt-1 font-serif text-[26px] leading-tight tracking-[-0.02em] tabular-nums"
                          style={{ color: negative ? 'var(--color-maple)' : 'var(--color-ink)' }}
                        >
                          <PrivacyBlur hidden={hidden}>{fmtCAD(display)}</PrivacyBlur>
                        </div>
                        <div className="flex-1" />
                        <div className="text-[11px] text-[var(--color-ink-3)]">
                          {a.ownership === 'shared' ? 'Shared' : 'Personal'} · tap to flip
                        </div>
                      </div>
                      {/* back — this-month stats */}
                      <div
                        className="absolute inset-0 flex flex-col justify-between rounded-[18px] p-4 text-white"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-leaf) 0%, #0f3a25 100%)',
                          backfaceVisibility: 'hidden',
                          WebkitBackfaceVisibility: 'hidden',
                          transform: 'rotateY(180deg)',
                        }}
                      >
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-[0.10em] opacity-70">
                            This month
                          </div>
                          <div className="mt-1 truncate font-serif text-[16px] tracking-[-0.01em] opacity-95">
                            {a.name}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <div className="opacity-60">{isLoan ? 'Charged' : 'Out'}</div>
                            <div className="font-serif text-[16px] tabular-nums">
                              <PrivacyBlur hidden={hidden}>
                                {fmtCAD(a.month_outflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div>
                            <div className="opacity-60">{isLoan ? 'Paid' : 'In'}</div>
                            <div className="font-serif text-[16px] tabular-nums">
                              <PrivacyBlur hidden={hidden}>
                                {fmtCAD(a.month_inflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div className="col-span-2 mt-1 flex items-end justify-between border-t border-white/15 pt-2">
                            <div>
                              <div className="opacity-60">Net</div>
                              <div
                                className="font-serif text-[18px] tabular-nums"
                                style={{
                                  color: monthNet >= 0 ? '#bdf0d2' : '#ffb6a3',
                                }}
                              >
                                <PrivacyBlur hidden={hidden}>
                                  {monthNet >= 0 ? '+' : '−'}
                                  {fmtCAD(Math.abs(monthNet))}
                                </PrivacyBlur>
                              </div>
                            </div>
                            <div className="text-right opacity-70">
                              <div className="text-[10px] uppercase tracking-[0.08em]">Activity</div>
                              <div className="font-serif text-[14px] tabular-nums">
                                {a.month_tx_count} tx
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </Reveal>
              )
            })}
          </div>
        )}
      </section>

      {/* ───────── Spending breakdown ───────── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Where it went</MapleLabel>
          <a href="/budgets" className="text-[12px] font-semibold text-[var(--color-leaf)] hover:underline">
            Budgets →
          </a>
        </div>
        <div className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5">
          {spendingBreakdown.length === 0 ? (
            <p className="text-[14px] text-[var(--color-ink-2)]">
              No categorised expenses this month.{' '}
              <a href="/transactions" className="font-semibold text-[var(--color-leaf)] underline">
                Add some
              </a>
              .
            </p>
          ) : (
            <>
              <div className="flex h-[10px] gap-[2px] overflow-hidden rounded-full bg-[var(--color-paper-2)]">
                {spendingBreakdown.map((b) => (
                  <div key={b.id} className="h-full" style={{ flex: b.amount_cents, background: colorForCategory(b.name) }} />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {spendingBreakdown.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForCategory(b.name) }} />
                    <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--color-ink)]">
                      {b.name}
                    </div>
                    <div className="shrink-0 font-serif text-[14px] tabular-nums text-[var(--color-ink-2)]">
                      <PrivacyBlur hidden={hidden}>{formatMoney(b.amount_cents)}</PrivacyBlur>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  )
}
function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A11 11 0 0 1 12 6c7 0 11 6 11 6a18 18 0 0 1-4 4.7" />
      <path d="M6.6 6.6A18 18 0 0 0 1 12s4 6 11 6a11 11 0 0 0 4.9-1.2" />
      <path d="M14.1 14.1A3 3 0 1 1 9.9 9.9" />
    </svg>
  )
}
