'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { formatMoney, formatMoneySigned, formatDate, monthLabel } from '@/lib/format'
import { smoothPath, seriesToPoints } from '@/lib/maple'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { Reveal } from '@/components/ui/reveal'
import { PrivacyBlur } from '@/components/ui/privacy-blur'
import { useCountUp } from '@/components/ui/count-up'
import { colorForCategory } from '@/lib/category-colors'

// Fixed brand gradient for the net-worth hero. Uses the light-mode leaf values
// directly (not tokens) so the surface stays deep green in BOTH light and dark
// mode — tokens invert leaf to a pale mint in dark mode, which would wash the
// hero out. The chart + text below ride on top of this with light foreground
// colours, so contrast holds either way.
const HERO_GRADIENT = 'linear-gradient(150deg, #1f5641 0%, #154031 100%)'
// Mint used for the hero chart stroke/area + the area-fill gradient. Legible on
// the deep-green surface in either theme.
const HERO_CHART = '#9ad8b4'

// ─── Widget registry ─────────────────────────────────────────────────────
// Every dashboard section is addressable by id. The user picks which to show
// and in what order via the Edit modal; their choice persists in localStorage.

const WIDGETS = [
  { id: 'greeting',        label: 'Greeting',        description: 'Month + name + member chips' },
  { id: 'net-worth',       label: 'Net worth',       description: 'Hero number + chart + range selector' },
  { id: 'month-stats',     label: 'Month stats',     description: 'Income, Spent, Saved tiles' },
  { id: 'budget-progress', label: 'Budget progress', description: 'This month spent vs budgeted' },
  { id: 'pace',            label: 'Pace',            description: 'Daily spend + projected month-end' },
  { id: 'accounts',        label: 'Accounts',        description: 'Horizontal scroll of flippable cards' },
  { id: 'spending',        label: 'Where it went',   description: 'Top categories breakdown bar' },
  { id: 'recurring',       label: 'Recurring',       description: 'Subscriptions + bills detected from last 3 months' },
  { id: 'goals',           label: 'Goals',           description: 'Progress towards your savings goals' },
  { id: 'recent-activity', label: 'Recent activity', description: 'Latest transactions across all accounts' },
] as const
type WidgetId = (typeof WIDGETS)[number]['id']
const DEFAULT_LAYOUT: WidgetId[] = ['greeting', 'net-worth', 'month-stats', 'accounts', 'spending']
const LAYOUT_KEY = 'maple.dashboardLayout.v1'

function loadLayout(): WidgetId[] {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT
    const valid = parsed.filter((id): id is WidgetId =>
      typeof id === 'string' && WIDGETS.some((w) => w.id === id),
    )
    return valid.length > 0 ? valid : DEFAULT_LAYOUT
  } catch {
    return DEFAULT_LAYOUT
  }
}

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
type GoalVM = { id: string; name: string; target: number; current: number; target_date: string | null }
type RecurringVM = { description: string; amount_cents: number; monthsSeen: number }
type RecentTxVM = {
  id: string
  amount_cents: number
  occurred_on: string
  description: string
  account_name: string
}
type PaceVM = { dailyPace: number; projectedMonth: number; daysElapsed: number; daysInMonth: number }

const RANGES = [
  { id: '1M', months: 1 },
  { id: '3M', months: 3 },
  { id: 'YTD', months: 0 },
  { id: '1Y', months: 12 },
  { id: 'ALL', months: 999 },
] as const
type RangeId = (typeof RANGES)[number]['id']

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
  totalBudget,
  goals,
  recurring,
  recurringTotal,
  recentActivity,
  pace,
  hasError = false,
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
  totalBudget: number
  goals: GoalVM[]
  recurring: RecurringVM[]
  recurringTotal: number
  recentActivity: RecentTxVM[]
  pace: PaceVM
  hasError?: boolean
}) {
  const [hidden, setHidden] = useState(false)
  const [range, setRange] = useState<RangeId>('1Y')
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  // Layout state: SSR + first paint use the default order; the persisted
  // selection swaps in after mount so hydration stays clean.
  const [layout, setLayout] = useState<WidgetId[]>(DEFAULT_LAYOUT)
  const [editOpen, setEditOpen] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLayout(loadLayout())
  }, [])
  function saveLayout(next: WidgetId[]) {
    setLayout(next)
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)) } catch {}
  }

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

  // Every dashboard section is built into the widgets map below. The return
  // statement just iterates `layout` — that's what makes reorder work.
  const widgets: Record<WidgetId, ReactNode> = {
    greeting: (
      <header key="greeting" className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {monthLabel(currentMonthISO)}
          </div>
          <h1 className="mt-1 font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[40px]">
            Bonjour, {firstName}.
          </h1>
          {/* Edit dashboard demoted here: a small ghost control in the greeting
              row instead of a floating pill competing with the primary action. */}
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            <PencilIcon />
            Edit dashboard
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-hair bg-paper text-ink-2 transition-all active:scale-95"
          >
            {hidden ? <EyeOffIcon /> : <EyeIcon />}
          </button>
          <div className="flex">
            {members.slice(0, 3).map((m, i) => (
              <div
                key={m.id}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-cream font-serif text-[15px] text-ink"
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
    ),
    'net-worth': (
      <Reveal key="net-worth">
        {/* Signature brand surface: a fixed deep-green gradient (not tokens, so
            it never inverts), light serif number, and a mint area chart riding
            beneath. Light foreground colours keep everything legible on green
            in both light and dark mode. */}
        <section
          className="relative overflow-hidden rounded-xl p-6 text-white shadow-[var(--shadow-card)] md:p-8"
          style={{ background: HERO_GRADIENT }}
        >
          {/* faint maple-leaf watermark */}
          <div className="pointer-events-none absolute -right-8 -top-8 opacity-10" aria-hidden>
            <svg width="180" height="180" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.4 3.6 3.8-1L15.6 8l4.4 2-4 2.2 1 4.4-4-1-1 3.4-1-3.4-4 1 1-4.4-4-2.2 4.4-2L8.8 4.6l3.8 1L12 2Z" />
            </svg>
          </div>

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.10em] text-white/70">
                Net worth
              </div>
              <div className="mt-2 font-serif text-[48px] leading-none tracking-[-0.03em] tabular-nums md:text-[64px]">
                <PrivacyBlur hidden={hidden}>{formatMoney(displayedValue)}</PrivacyBlur>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[13px]">
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold tabular-nums"
                  style={{ color: scrubPoint || deltaUp ? HERO_CHART : '#ffb6a3' }}
                >
                  <PrivacyBlur hidden={hidden}>
                    {scrubPoint
                      ? formatMoney(scrubPoint.value)
                      : formatMoneySigned(netWorthDelta, { plus: true })}
                  </PrivacyBlur>
                </span>
                <span className="text-white/60">{displayedLabel}</span>
              </div>
            </div>
            {/* Range selector (desktop) — translucent pills on the green */}
            <div className="hidden gap-0.5 rounded-full bg-white/10 p-1 sm:flex">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={
                    'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ' +
                    (range === r.id
                      ? 'bg-white/20 text-white'
                      : 'text-white/55 hover:text-white')
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
                  <stop offset="0%" stopColor={HERO_CHART} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={HERO_CHART} stopOpacity="0" />
                </linearGradient>
              </defs>
              {chartArea && <path d={chartArea} fill="url(#netWorthArea)" />}
              {chartPath && (
                <path
                  d={chartPath}
                  fill="none"
                  stroke={HERO_CHART}
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
                    stroke="rgba(255,255,255,0.4)"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                  />
                  <circle
                    cx={chartPoints[scrubIdx][0]}
                    cy={chartPoints[scrubIdx][1]}
                    r="5"
                    fill={HERO_CHART}
                    stroke="#fff"
                    strokeWidth="2.5"
                  />
                </g>
              )}
            </svg>
          </div>

          {/* Mobile range selector */}
          <div className="relative mt-3 flex gap-1 sm:hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={
                  'flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-all ' +
                  (range === r.id ? 'bg-white/20 text-white' : 'text-white/55')
                }
              >
                {r.id}
              </button>
            ))}
          </div>
        </section>
      </Reveal>
    ),
    'month-stats': (
      <section key="month-stats" className="grid grid-cols-3 gap-3">
        {([
          { label: 'Income', value: income, tone: 'leaf' as const, signed: false },
          { label: 'Spent', value: expenses, tone: 'maple' as const, signed: false },
          {
            label: 'Saved',
            value: net,
            tone: (net >= 0 ? 'leaf' : 'maple') as 'leaf' | 'maple',
            signed: true,
          },
        ]).map((s, i) => (
          <Reveal key={s.label} delay={120 + i * 60}>
            <StatTile
              label={s.label}
              tone={s.tone}
              value={
                <PrivacyBlur hidden={hidden}>
                  {/* Mobile drops cents (compact) so the negative-sign edge
                      case doesn't push the value past the narrow grid column. */}
                  <span className="md:hidden">
                    <Amount
                      cents={s.signed ? s.value : Math.abs(s.value)}
                      tone={s.tone}
                      sign={s.signed ? 'always' : 'none'}
                      compact
                    />
                  </span>
                  <span className="hidden md:inline">
                    <Amount
                      cents={s.signed ? s.value : Math.abs(s.value)}
                      tone={s.tone}
                      sign={s.signed ? 'always' : 'none'}
                    />
                  </span>
                </PrivacyBlur>
              }
            />
          </Reveal>
        ))}
      </section>
    ),
    accounts: (
      <section key="accounts">
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Accounts</MapleLabel>
          <Link href="/accounts" className="text-[12px] font-semibold text-leaf hover:underline">
            See all →
          </Link>
        </div>
        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed border-hair bg-paper-2 p-6 text-[14px] text-ink-2">
            No accounts yet.{' '}
            <Link href="/accounts" className="font-semibold text-leaf underline">
              Add one
            </Link>
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
                      {/* front — paper card */}
                      <div
                        className="absolute inset-0 flex flex-col rounded-md border border-hair bg-paper p-4"
                        style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
                            {accountTypeLabel(a.type)}
                          </div>
                          <div
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: a.ownership === 'shared' ? 'var(--color-maple)' : 'var(--color-leaf)' }}
                          />
                        </div>
                        <div className="mt-2 text-[14px] font-medium text-ink">{a.name}</div>
                        <div className="mt-1 text-[26px] leading-tight">
                          <PrivacyBlur hidden={hidden}>
                            <Amount cents={display} tone={negative ? 'maple' : 'ink'} />
                          </PrivacyBlur>
                        </div>
                        <div className="flex-1" />
                        <div className="text-[11px] text-ink-3">
                          {a.ownership === 'shared' ? 'Shared' : 'Personal'} · tap to flip
                        </div>
                      </div>
                      {/* back — this-month stats. Both gradient stops are tokens
                          so the surface follows the theme instead of inverting
                          a hardcoded hex against a token. */}
                      <div
                        className="absolute inset-0 flex flex-col justify-between rounded-md p-4 text-white"
                        style={{
                          background:
                            'linear-gradient(135deg, var(--color-leaf) 0%, var(--color-leaf-deep) 100%)',
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
                                {formatMoney(a.month_outflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div>
                            <div className="opacity-60">{isLoan ? 'Paid' : 'In'}</div>
                            <div className="font-serif text-[16px] tabular-nums">
                              <PrivacyBlur hidden={hidden}>
                                {formatMoney(a.month_inflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div className="col-span-2 mt-1 flex items-end justify-between border-t border-white/15 pt-2">
                            <div>
                              <div className="opacity-60">Net</div>
                              <div
                                className="font-serif text-[18px] tabular-nums"
                                style={{ color: monthNet >= 0 ? '#bdf0d2' : '#ffb6a3' }}
                              >
                                <PrivacyBlur hidden={hidden}>
                                  {formatMoneySigned(monthNet, { plus: true })}
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
    ),
    spending: (
      <section key="spending">
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Where it went</MapleLabel>
          <Link href="/budgets" className="text-[12px] font-semibold text-leaf hover:underline">
            Budgets →
          </Link>
        </div>
        <Card>
          {spendingBreakdown.length === 0 ? (
            <p className="text-[14px] text-ink-2">
              No categorised expenses this month.{' '}
              <Link href="/transactions" className="font-semibold text-leaf underline">
                Add some
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="flex h-[10px] gap-[2px] overflow-hidden rounded-full bg-paper-2">
                {spendingBreakdown.map((b) => (
                  <div key={b.id} className="h-full" style={{ flex: b.amount_cents, background: colorForCategory(b.name) }} />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {spendingBreakdown.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorForCategory(b.name) }} />
                    <div className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">
                      {b.name}
                    </div>
                    <div className="shrink-0 text-[14px]">
                      <PrivacyBlur hidden={hidden}>
                        <Amount cents={b.amount_cents} />
                      </PrivacyBlur>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </section>
    ),

    'budget-progress': (() => {
      const pct = totalBudget > 0 ? Math.min(1.2, expenses / totalBudget) : 0
      const over = pct > 1
      const breakpoint = over ? 100 / pct : null
      return (
        <Card key="budget-progress" padding="lg">
          <div className="flex items-baseline justify-between gap-2">
            <MapleLabel>Budget</MapleLabel>
            <Link
              href="/budgets"
              className="text-[12px] font-semibold text-leaf hover:underline"
            >
              See all →
            </Link>
          </div>
          {totalBudget === 0 ? (
            <div className="mt-2 text-[13.5px] text-ink-2">
              No budgets set this month.{' '}
              <Link href="/budgets" className="font-semibold text-leaf underline">
                Add some
              </Link>
              .
            </div>
          ) : (
            <>
              <div className="mt-1.5 text-[24px] leading-tight md:text-[28px]">
                <PrivacyBlur hidden={hidden}>
                  <Amount cents={expenses} />{' '}
                  <span className="font-serif tabular-nums text-ink-3">
                    of {formatMoney(totalBudget)}
                  </span>
                </PrivacyBlur>
              </div>
              <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-paper-2">
                <div
                  role="progressbar"
                  aria-label="Budget used this month"
                  aria-valuenow={Math.round(pct * 100)}
                  aria-valuemin={0}
                  aria-valuemax={120}
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: over ? '100%' : `${Math.round(pct * 100)}%`,
                    background: over
                      ? `linear-gradient(to right, var(--color-leaf) 0%, var(--color-leaf) ${breakpoint}%, var(--color-maple) ${breakpoint}%, var(--color-maple) 100%)`
                      : 'var(--color-leaf)',
                  }}
                />
                {breakpoint !== null && (
                  <div
                    className="pointer-events-none absolute inset-y-0 w-[2px] bg-paper"
                    style={{ left: `calc(${breakpoint}% - 1px)` }}
                    aria-hidden
                  />
                )}
              </div>
              <div className="mt-2 text-[12px] text-ink-3">
                {over ? (
                  <span className="text-maple">{formatMoney(expenses - totalBudget)} over budget</span>
                ) : (
                  `${formatMoney(totalBudget - expenses)} left`
                )}
              </div>
            </>
          )}
        </Card>
      )
    })(),

    pace: (() => {
      const isCurrentMonth = pace.daysElapsed > 0 && pace.daysElapsed < pace.daysInMonth
      return (
        <Card key="pace" padding="lg">
          <MapleLabel>Pace</MapleLabel>
          {!isCurrentMonth ? (
            <div className="mt-1.5 text-[13.5px] text-ink-2">
              {pace.daysElapsed === 0 ? 'Future month — no pace yet.' : 'Month complete.'}
            </div>
          ) : (
            <>
              <div className="mt-1.5 text-[24px] leading-tight md:text-[28px]">
                <PrivacyBlur hidden={hidden}>
                  <Amount cents={pace.dailyPace} />
                </PrivacyBlur>
                <span className="font-serif text-[14px] font-normal text-ink-3">/day</span>
              </div>
              <div className="mt-1 text-[12.5px] text-ink-2">
                Day {pace.daysElapsed} of {pace.daysInMonth} · projected{' '}
                <span className="font-semibold tabular-nums text-ink">
                  <PrivacyBlur hidden={hidden}>{formatMoney(pace.projectedMonth)}</PrivacyBlur>
                </span>{' '}
                this month
              </div>
            </>
          )}
        </Card>
      )
    })(),

    recurring: (
      <Card key="recurring" padding="lg">
        <div className="flex items-baseline justify-between gap-2">
          <MapleLabel>Recurring</MapleLabel>
          <span className="text-[10.5px] tabular-nums text-ink-3">
            {recurring.length} item{recurring.length === 1 ? '' : 's'}
          </span>
        </div>
        {recurring.length === 0 ? (
          <div className="mt-1.5 text-[13.5px] text-ink-2">
            Nothing detected yet — recurring transactions appear here once we see them in 2+ of the last 3 months.
          </div>
        ) : (
          <>
            <div className="mt-1.5 text-[24px] leading-tight md:text-[28px]">
              <PrivacyBlur hidden={hidden}>
                <Amount cents={recurringTotal} />
              </PrivacyBlur>
              <span className="font-serif text-[14px] font-normal text-ink-3">/mo</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 border-t border-hair pt-3">
              {recurring.slice(0, 5).map((g) => (
                <li
                  key={g.description + g.amount_cents}
                  className="flex items-baseline gap-2 text-[12.5px]"
                >
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {g.description}
                  </span>
                  <span className="shrink-0 rounded-full bg-paper-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-ink-3">
                    {g.monthsSeen}/3
                  </span>
                  <span className="shrink-0 text-[13px]">
                    <PrivacyBlur hidden={hidden}>
                      <Amount cents={g.amount_cents} />
                    </PrivacyBlur>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    ),

    goals: (
      <section key="goals">
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Goals</MapleLabel>
          <Link href="/goals" className="text-[12px] font-semibold text-leaf hover:underline">
            See all →
          </Link>
        </div>
        {goals.length === 0 ? (
          <div className="rounded-md border border-dashed border-hair bg-paper-2 p-6 text-[14px] text-ink-2">
            No active goals.{' '}
            <Link href="/goals" className="font-semibold text-leaf underline">
              Set one
            </Link>
            .
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {goals.slice(0, 4).map((g) => {
              const pct = g.target > 0 ? Math.min(1, g.current / g.target) : 0
              return (
                <li
                  key={g.id}
                  className="rounded-md border border-hair bg-paper p-3.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">
                      {g.name}
                    </span>
                    <span className="shrink-0 text-[13px]">
                      <PrivacyBlur hidden={hidden}>
                        <Amount cents={g.current} />{' '}
                        <span className="font-serif tabular-nums text-ink-3">
                          of {formatMoney(g.target)}
                        </span>
                      </PrivacyBlur>
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-2">
                    <div
                      role="progressbar"
                      aria-label={`${g.name} progress`}
                      aria-valuenow={Math.round(pct * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-full rounded-full bg-leaf transition-all duration-300"
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    ),

    'recent-activity': (
      <section key="recent-activity">
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Recent activity</MapleLabel>
          <Link href="/transactions" className="text-[12px] font-semibold text-leaf hover:underline">
            See all →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <div className="rounded-md border border-dashed border-hair bg-paper-2 p-6 text-[14px] text-ink-2">
            No transactions yet.
          </div>
        ) : (
          <ul className="overflow-hidden rounded-md border border-hair bg-paper">
            {recentActivity.slice(0, 5).map((t, i) => {
              const isOut = t.amount_cents > 0
              return (
                <li
                  key={t.id}
                  className={
                    'flex items-center gap-3 px-4 py-2.5 ' +
                    (i > 0 ? 'border-t border-hair' : '')
                  }
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium text-ink">
                      {t.description}
                    </div>
                    <div className="truncate text-[11.5px] text-ink-3">
                      {formatDate(t.occurred_on)} · {t.account_name}
                    </div>
                  </div>
                  <div className="shrink-0 text-[14.5px]">
                    <PrivacyBlur hidden={hidden}>
                      {/* Outflows are positive cents (down/maple), inflows
                          negative (up/leaf). Flip the sign so the displayed
                          number matches a spend = "−" convention. */}
                      <Amount
                        cents={-t.amount_cents}
                        sign="always"
                        tone={isOut ? 'maple' : 'leaf'}
                      />
                    </PrivacyBlur>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    ),
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* A failed query means a card would otherwise read $0 — surface it so the
          user knows the number is missing data, not real. */}
      {hasError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-maple/30 bg-maple-soft px-4 py-3 text-[13px] text-maple"
        >
          <span className="mt-px shrink-0" aria-hidden>
            <AlertIcon />
          </span>
          <span>
            Some figures couldn’t load just now, so parts of your dashboard may be
            incomplete. Pull to refresh or try again shortly.
          </span>
        </div>
      )}

      {/* Primary action — obvious leaf button anchored top-right of the page so
          it stays reachable even when the greeting widget is hidden. */}
      <div className="flex items-center justify-end">
        <Link
          href="/transactions"
          className="inline-flex h-[46px] items-center justify-center gap-2 rounded-full bg-leaf px-5 text-[14px] font-semibold tracking-[-0.01em] text-paper shadow-[var(--shadow-card)] transition-transform duration-150 active:scale-[0.97]"
        >
          <PlusIcon />
          Add transaction
        </Link>
      </div>

      {layout.map((id) => (
        <Fragment key={id}>{widgets[id]}</Fragment>
      ))}

      {editOpen && (
        <DashboardEditor
          current={layout}
          onCancel={() => setEditOpen(false)}
          onSave={(next) => {
            saveLayout(next)
            setEditOpen(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Editor modal ─────────────────────────────────────────────────────────

const isBrowser = typeof window !== 'undefined'

function DashboardEditor({
  current,
  onCancel,
  onSave,
}: {
  current: WidgetId[]
  onCancel: () => void
  onSave: (next: WidgetId[]) => void
}) {
  const [draft, setDraft] = useState<WidgetId[]>(current)

  function move(id: WidgetId, dir: -1 | 1) {
    setDraft((prev) => {
      const i = prev.indexOf(id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function remove(id: WidgetId) {
    setDraft((prev) => prev.filter((x) => x !== id))
  }
  function add(id: WidgetId) {
    setDraft((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const visible = draft
    .map((id) => WIDGETS.find((w) => w.id === id))
    .filter((w): w is (typeof WIDGETS)[number] => !!w)
  const hiddenWidgets = WIDGETS.filter((w) => !draft.includes(w.id))

  if (!isBrowser) return null

  return createPortal(
    <>
      <button
        type="button"
        aria-hidden="true"
        onClick={onCancel}
        className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-label="Edit dashboard"
        className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88vh] flex-col rounded-t-xl border-t border-hair bg-cream shadow-[var(--shadow-float)] sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[80vh] sm:w-[460px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex justify-center pb-1 pt-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-hair" aria-hidden />
        </div>
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5 sm:py-5">
          <div>
            <div className="font-serif text-[20px] tracking-[-0.02em] text-ink">
              Edit dashboard
            </div>
            <div className="mt-0.5 text-[12px] text-ink-2">
              Pick the widgets you want, drag-rank with the arrows.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close edit dashboard"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-hair bg-paper text-ink-2"
          >
            <CloseGlyph />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-ink-3">
            On the dashboard ({visible.length})
          </div>
          <ul className="flex flex-col gap-1.5">
            {visible.length === 0 && (
              <li className="rounded-md border border-dashed border-hair bg-paper px-3 py-3 text-center text-[12.5px] text-ink-2">
                Add a widget below to put it on the dashboard.
              </li>
            )}
            {visible.map((w, i) => (
              <li
                key={w.id}
                className="flex items-center gap-2 rounded-md border border-hair bg-paper px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">
                    {w.label}
                  </div>
                  <div className="truncate text-[11.5px] text-ink-3">
                    {w.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => move(w.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${w.label} up`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
                >
                  <ArrowUpGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => move(w.id, 1)}
                  disabled={i === visible.length - 1}
                  aria-label={`Move ${w.label} down`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
                >
                  <ArrowDownGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={`Hide ${w.label}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-maple"
                >
                  <CloseGlyph />
                </button>
              </li>
            ))}
          </ul>

          {hiddenWidgets.length > 0 && (
            <>
              <div className="mt-4 px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-ink-3">
                Available widgets
              </div>
              <ul className="flex flex-col gap-1.5">
                {hiddenWidgets.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 rounded-md border border-hair bg-paper-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-ink-2">
                        {w.label}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        {w.description}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => add(w.id)}
                      aria-label={`Add ${w.label} to dashboard`}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-paper px-3 text-[12px] font-semibold text-ink"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-hair px-5 py-3.5 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_LAYOUT)}
            className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          >
            Reset to default
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => onSave(draft)}>
              Save
            </Button>
          </div>
        </footer>
      </div>
    </>,
    document.body,
  )
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}
function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
function ArrowUpGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
function ArrowDownGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
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
