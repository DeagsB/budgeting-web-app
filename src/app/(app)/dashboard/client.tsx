'use client'

import { useMemo, useState } from 'react'
import { formatMoney, monthLabel } from '@/lib/format'
import { fmtCADshort, fmtSignCAD, smoothPath, seriesToPoints } from '@/lib/maple'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
import { Reveal } from '@/components/ui/reveal'
import { PrivacyBlur } from '@/components/ui/privacy-blur'
import { useCountUp } from '@/components/ui/count-up'

type MemberVM = { id: string; name: string; initial: string }
type AccountVM = {
  id: string
  name: string
  type: AccountType
  ownership: string
  member_id: string | null
  balance_cents: number
}
type TrailPoint = { month: string; value: number }
type SpendBucket = { id: string; name: string; amount_cents: number }

const RANGES = [
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: 'YTD', months: 0 }, // special-cased below
  { id: '1Y', months: 12 },
  { id: 'ALL', months: 12 }, // we only have 12 months of trail
] as const
type RangeId = (typeof RANGES)[number]['id']

const CATEGORY_COLORS: Record<string, string> = {
  Housing: '#6366F1',
  Transportation: '#F59E0B',
  Food: '#10B981',
  Health: '#14B8A6',
  Personal: '#EC4899',
  Subscriptions: '#06B6D4',
  Entertainment: '#8B5CF6',
  'Savings contribution': '#8B5CF6',
  Taxes: '#D4A574',
  'Debt payment': '#EF4444',
  Miscellaneous: '#A89B8E',
}

function colorForCategory(name: string): string {
  return CATEGORY_COLORS[name] ?? '#6B5F54'
}

export function DashboardClient({
  householdName,
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

  const animatedNetWorth = useCountUp(netWorth, { duration: 1200 })
  const animatedDelta = useCountUp(netWorthDelta, { duration: 1200 })

  const filteredTrail = useMemo(() => {
    if (range === 'ALL' || range === '1Y') return netWorthTrail
    if (range === 'YTD') {
      const year = currentMonthISO.slice(0, 4)
      return netWorthTrail.filter((p) => p.month >= `${year}-01-01`)
    }
    const keep = RANGES.find((r) => r.id === range)?.months ?? 12
    return netWorthTrail.slice(Math.max(0, netWorthTrail.length - keep - 1))
  }, [netWorthTrail, range, currentMonthISO])

  const chartWidth = 320
  const chartHeight = 110
  const chartPoints = useMemo(
    () =>
      seriesToPoints(
        filteredTrail.map((p) => p.value),
        chartWidth,
        chartHeight,
        { pad: 8 },
      ),
    [filteredTrail],
  )
  const chartPath = useMemo(() => smoothPath(chartPoints), [chartPoints])
  const chartArea =
    chartPoints.length > 0
      ? `${chartPath} L${chartPoints[chartPoints.length - 1][0]},${chartHeight} L${chartPoints[0][0]},${chartHeight} Z`
      : ''

  const handleScrub = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const idx = Math.round(xFrac * (filteredTrail.length - 1))
    setScrubIdx(idx)
  }

  const scrubPoint = scrubIdx !== null ? filteredTrail[scrubIdx] : null
  const displayedNetWorth = scrubPoint ? scrubPoint.value : animatedNetWorth
  const displayedDelta = animatedDelta

  const greeting = members[0]?.name ? `Bonjour, ${members[0].name}` : householdName

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] text-ink-2">{monthLabel(currentMonthISO)}</div>
          <h1 className="font-serif text-[32px] leading-none tracking-[-0.02em] text-ink">
            {greeting}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hair bg-paper text-ink-2 transition-transform active:scale-95"
          >
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <div className="flex">
            {members.slice(0, 2).map((m, i) => (
              <div
                key={m.id}
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-cream font-serif text-sm font-semibold text-ink"
                style={{
                  background: i === 0 ? 'var(--color-butter)' : 'var(--color-leaf-soft)',
                  marginLeft: i === 0 ? 0 : -10,
                }}
              >
                {m.initial.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Net-worth hero */}
      <Reveal>
        <section
          className="relative overflow-hidden rounded-[24px] p-6 text-[var(--color-paper)] shadow-[var(--shadow-card)]"
          style={{
            background:
              'linear-gradient(150deg, var(--color-leaf) 0%, var(--color-leaf-deep) 100%)',
          }}
        >
          <MapleTriangleGlyph />
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] opacity-70">
            Net worth
          </div>
          <div className="mt-1 font-serif text-[44px] leading-none tracking-[-0.03em] tabular-nums">
            <PrivacyBlur hidden={hidden}>{fmtCADshort(displayedNetWorth)}</PrivacyBlur>
          </div>
          <div className="mt-2 flex items-baseline gap-2 text-[13px]">
            <span className="font-semibold" style={{ color: 'var(--color-leaf-deep)' }}>
              <PrivacyBlur hidden={hidden}>
                {scrubPoint ? '—' : fmtSignCAD(displayedDelta)}
              </PrivacyBlur>
            </span>
            <span className="text-white/60">
              {scrubPoint ? monthLabel(scrubPoint.month) : 'vs last month'}
            </span>
          </div>

          {/* Sparkline */}
          <div className="relative mt-4">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              className="block h-[110px] w-full cursor-crosshair"
              onPointerMove={handleScrub}
              onPointerLeave={() => setScrubIdx(null)}
            >
              <defs>
                <linearGradient id="dashboardArea" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-leaf-deep)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--color-leaf-deep)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {chartArea && <path d={chartArea} fill="url(#dashboardArea)" />}
              {chartPath && (
                <path
                  d={chartPath}
                  fill="none"
                  stroke="var(--color-leaf-deep)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
              {scrubIdx !== null && chartPoints[scrubIdx] && (
                <>
                  <line
                    x1={chartPoints[scrubIdx][0]}
                    x2={chartPoints[scrubIdx][0]}
                    y1={0}
                    y2={chartHeight}
                    stroke="rgba(255,255,255,0.45)"
                    strokeDasharray="2 3"
                  />
                  <circle
                    cx={chartPoints[scrubIdx][0]}
                    cy={chartPoints[scrubIdx][1]}
                    r="5"
                    fill="var(--color-leaf-deep)"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </>
              )}
            </svg>
          </div>

          {/* Range selector */}
          <div className="mt-3 flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`flex-1 rounded-[8px] px-0 py-1.5 text-[11px] font-semibold transition-colors ${
                  range === r.id
                    ? 'bg-white/20 text-white'
                    : 'text-white/55 hover:text-white/80'
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </section>
      </Reveal>

      {/* Three stats */}
      <section className="grid grid-cols-3 gap-2">
        {[
          { label: 'Income', value: fmtCADshort(income), color: 'var(--color-up)' },
          { label: 'Spent', value: fmtCADshort(expenses), color: 'var(--color-ink)' },
          { label: 'Saved', value: `${net >= 0 ? '+' : '-'}${fmtCADshort(Math.abs(net))}`, color: 'var(--color-leaf)' },
        ].map((s, i) => (
          <Reveal key={s.label} delay={120 + i * 60}>
            <div className="rounded-[18px] border border-hair bg-paper p-4">
              <MapleLabel>{s.label}</MapleLabel>
              <div
                className="mt-1 font-serif text-[22px] leading-tight tracking-[-0.02em] tabular-nums"
                style={{ color: s.color }}
              >
                <PrivacyBlur hidden={hidden}>{s.value}</PrivacyBlur>
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      {/* Accounts */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <MapleLabel>Accounts</MapleLabel>
          <a href="/accounts" className="text-xs font-semibold text-leaf">
            See all
          </a>
        </div>
        <div className="hide-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {accounts.length === 0 && (
            <div className="w-full rounded-[18px] border border-dashed border-hair bg-paper p-6 text-sm text-ink-2">
              No accounts yet.{' '}
              <a href="/accounts" className="font-semibold text-leaf underline">
                Add one
              </a>
              .
            </div>
          )}
          {accounts.slice(0, 6).map((a, i) => {
            const isFlipped = !!flipped[a.id]
            const isLiability = LIABILITY_TYPES.has(a.type)
            const display = Math.abs(a.balance_cents)
            const negative = a.balance_cents < 0 || isLiability
            const last4 = a.id.replace(/-/g, '').slice(-4).toUpperCase()
            return (
              <Reveal key={a.id} delay={240 + i * 60}>
                <button
                  type="button"
                  onClick={() => setFlipped((f) => ({ ...f, [a.id]: !f[a.id] }))}
                  className="block w-[220px] snap-start text-left"
                  style={{ perspective: 1000 }}
                >
                  <div
                    className="relative h-[140px] w-full"
                    style={{
                      transformStyle: 'preserve-3d',
                      transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0)',
                      transition: 'transform 550ms var(--ease-ios)',
                    }}
                  >
                    {/* front */}
                    <div
                      className="absolute inset-0 flex flex-col rounded-[18px] border border-hair bg-paper p-4"
                      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-2">
                          {accountTypeLabel(a.type)}
                        </div>
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              a.ownership === 'shared' ? 'var(--color-maple)' : 'var(--color-leaf)',
                          }}
                        />
                      </div>
                      <div className="mt-2 text-[13px] font-medium text-ink">{a.name}</div>
                      <div
                        className="mt-1 font-serif text-[24px] leading-tight tracking-[-0.02em] tabular-nums"
                        style={{ color: negative ? 'var(--color-down)' : 'var(--color-ink)' }}
                      >
                        <PrivacyBlur hidden={hidden}>{fmtCADshort(display)}</PrivacyBlur>
                      </div>
                      <div className="flex-1" />
                      <div className="text-[11px] text-ink-2">
                        {a.ownership === 'shared' ? 'Shared' : 'Personal'} · tap to flip
                      </div>
                    </div>
                    {/* back */}
                    <div
                      className="absolute inset-0 flex flex-col justify-between rounded-[18px] p-4 text-[var(--color-paper)]"
                      style={{
                        background:
                          'linear-gradient(150deg, var(--color-leaf) 0%, var(--color-leaf-deep) 100%)',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden',
                        transform: 'rotateY(180deg)',
                      }}
                    >
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.08em] opacity-70">
                          •••• last 4
                        </div>
                        <div className="mt-1 font-serif text-[22px] tracking-[0.2em]">
                          •••• {last4}
                        </div>
                      </div>
                      <div className="flex items-end justify-between text-[11px]">
                        <div>
                          <div className="opacity-60">Available</div>
                          <div className="font-serif text-[18px]">
                            <PrivacyBlur hidden={hidden}>
                              {fmtCADshort(Math.max(0, a.balance_cents))}
                            </PrivacyBlur>
                          </div>
                        </div>
                        <div className="opacity-70">{accountTypeLabel(a.type)}</div>
                      </div>
                    </div>
                  </div>
                </button>
              </Reveal>
            )
          })}
        </div>
      </section>

      {/* Spending breakdown */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <MapleLabel>Where it went</MapleLabel>
          <a href="/budgets" className="text-xs font-semibold text-leaf">
            Budgets
          </a>
        </div>
        <div className="rounded-[20px] border border-hair bg-paper p-5">
          {spendingBreakdown.length === 0 ? (
            <p className="text-sm text-ink-2">
              No categorised expenses this month.{' '}
              <a href="/transactions" className="font-semibold text-leaf underline">
                Add some
              </a>
              .
            </p>
          ) : (
            <>
              <div className="flex h-[10px] gap-px overflow-hidden rounded-md bg-cream">
                {spendingBreakdown.map((b) => (
                  <div
                    key={b.id}
                    className="h-full"
                    style={{ flex: b.amount_cents, background: colorForCategory(b.name) }}
                  />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {spendingBreakdown.map((b) => (
                  <div key={b.id} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ background: colorForCategory(b.name) }}
                    />
                    <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {b.name}
                    </div>
                    <div className="shrink-0 text-xs font-medium tabular-nums text-ink-2">
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

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.1A11 11 0 0 1 12 6c7 0 11 6 11 6a18 18 0 0 1-4 4.7" />
      <path d="M6.6 6.6A18 18 0 0 0 1 12s4 6 11 6a11 11 0 0 0 4.9-1.2" />
      <path d="M14.1 14.1A3 3 0 1 1 9.9 9.9" />
    </svg>
  )
}

function MapleTriangleGlyph() {
  // Subtle serif "M" style flourish glyph in the corner — echoes the brand
  // stamp from the onboarding screen without needing a logo asset.
  return (
    <svg
      className="absolute -top-8 -right-8 opacity-[0.08]"
      width="160"
      height="160"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z" />
    </svg>
  )
}
