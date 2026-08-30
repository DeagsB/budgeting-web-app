'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { formatMoney, formatMoneySigned, monthLabel } from '@/lib/format'
import { smoothPath, seriesToPoints } from '@/lib/maple'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/ui/reveal'
import { HideBalancesContext, PrivacyBlur } from '@/components/ui/privacy-blur'
import { useCountUp } from '@/components/ui/count-up'
import { useQuickAddTarget } from '@/lib/quick-add'
import { DEFAULT_LAYOUT, WIDGETS, type WidgetId } from './layout-config'
import { useStoredValue, writeStoredValue } from '@/lib/use-stored-value'
import { ReauthNotice } from '@/components/plaid/reauth-notice'
import type { PlaidAttentionItem } from '@/lib/plaid-attention'

// Fixed brand gradient for the net-worth hero. Uses the light-mode leaf values
// directly (not tokens) so the surface stays deep green in BOTH light and dark
// mode - tokens invert leaf to a pale mint in dark mode, which would wash the
// hero out. The chart + text below ride on top of this with light foreground
// colours, so contrast holds either way.
const HERO_GRADIENT = 'linear-gradient(150deg, #1f5641 0%, #154031 100%)'
// Mint used for the hero chart stroke/area + the area-fill gradient. Legible on
// the deep-green surface in either theme.
const HERO_CHART = '#9ad8b4'

// ─── Widget registry ─────────────────────────────────────────────────────
// Every dashboard section is addressable by id. The user picks which to show
// and in what order via the Edit modal; their choice persists in localStorage.

// Sheets are loaded on first open so the sheet primitive, the add form and
// the layout editor stay off the cold-start critical path.
const AddTransactionSheet = dynamic(
  () => import('./add-sheet').then((m) => m.AddTransactionSheet),
  { ssr: false },
)
const DashboardEditor = dynamic(
  () => import('./editor').then((m) => m.DashboardEditor),
  { ssr: false },
)

const LAYOUT_KEY = 'maple.dashboardLayout.v1'
const HIDE_BALANCES_KEY = 'maple.hideBalances.v1'

// Pure parsers for the persisted dashboard preferences (see useStoredValue).
function parseLayout(raw: string | null): WidgetId[] {
  if (!raw) return DEFAULT_LAYOUT
  try {
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

function parseHideBalances(raw: string | null): boolean {
  // Balances are hidden by default: only an explicit "show" choice ('0')
  // reveals them, so a fresh device / cleared storage errs on privacy.
  return raw !== '0'
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
export type SpendBucket = { id: string; name: string; amount_cents: number }
export type GoalVM = { id: string; name: string; target: number; current: number; target_date: string | null }
export type RecurringVM = { description: string; amount_cents: number; monthsSeen: number }
export type RecentTxVM = {
  id: string
  amount_cents: number
  occurred_on: string
  description: string
  account_name: string
}
export type PaceVM = { dailyPace: number; projectedMonth: number; daysElapsed: number; daysInMonth: number }
type CategoryVM = { id: string; parent_id: string | null; name: string }
export type CategoryBudgetVM = { id: string; name: string; budget: number; spent: number; left: number }
export type InboxVM = { count: number; amountCents: number; accountCount: number; hasEarlierMonths: boolean }

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
  myMemberId = null,
  currentMonthISO,
  netWorth,
  netWorthDelta,
  netWorthTrail,
  accounts,
  categories,
  hasError = false,
  plaidAttention,
  slots = {},
}: {
  householdName: string
  members: MemberVM[]
  /** The signed-in member; the greeting addresses them, not the first row. */
  myMemberId?: string | null
  currentMonthISO: string
  netWorth: number
  netWorthDelta: number
  netWorthTrail: TrailPoint[]
  accounts: AccountVM[]
  /** Category list for the add-transaction sheet opened from the FAB. */
  categories: CategoryVM[]
  hasError?: boolean
  /** Linked banks that need reconnecting, rendered under the greeting. */
  plaidAttention: PlaidAttentionItem[]
  /** Server-rendered display-only widgets (see widgets.tsx), keyed by widget id. */
  slots?: Partial<Record<WidgetId, ReactNode>>
}) {
  // Hide-balances state: the server snapshot is "hidden" so figures are
  // never readable before the persisted choice is read on the client.
  const hidden = useStoredValue(HIDE_BALANCES_KEY, parseHideBalances, true)
  const [addOpen, setAddOpen] = useState(false)
  // The tab bar's centre "+" opens this sheet while the dashboard is mounted.
  useQuickAddTarget(accounts.length > 0 ? () => setAddOpen(true) : null)
  const [range, setRange] = useState<RangeId>('1Y')
  const [scrubIdx, setScrubIdx] = useState<number | null>(null)
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})
  // Layout state: the server snapshot is the default order; the persisted
  // selection is read synchronously on the client (no second commit).
  const layout = useStoredValue(LAYOUT_KEY, parseLayout, DEFAULT_LAYOUT)
  const [editOpen, setEditOpen] = useState(false)
  // Perf marker read by scripts/perf (dashboard hydrated + interactive).
  useEffect(() => {
    performance.mark('maple:dashboard-hydrated')
    // Warm the add-transaction chunk once the page is idle; it's the most
    // likely next tap and the service worker keeps it for later launches.
    const t = setTimeout(() => { void import('./add-sheet') }, 2500)
    return () => clearTimeout(t)
  }, [])
  function saveLayout(next: WidgetId[]) {
    writeStoredValue(LAYOUT_KEY, JSON.stringify(next))
  }
  function toggleHidden() {
    writeStoredValue(HIDE_BALANCES_KEY, hidden ? '0' : '1')
  }

  // Count up from last month's figure so the first frame is a real number,
  // not "$0.00".
  const previousNet =
    netWorthTrail.length > 1 ? netWorthTrail[netWorthTrail.length - 2].value : netWorth
  const animatedNet = useCountUp(netWorth, { duration: 1100, from: previousNet })

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

  const me = members.find((m) => m.id === myMemberId) ?? members[0]
  const firstName = me?.name?.split(' ')[0] ?? 'there'

  // Every dashboard section is built into the widgets map below. The return
  // statement just iterates `layout` - that's what makes reorder work.
  const widgets: Partial<Record<WidgetId, ReactNode>> = {
    greeting: (
      <Fragment key="greeting">
        <header className="flex items-end justify-between gap-4">
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
              onClick={toggleHidden}
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
        {/* Bank attention - rendered as part of the greeting widget's slot so
            it stays directly under the greeting and above "to categorize"
            regardless of how the user reorders the rest of the layout. */}
        {plaidAttention.length > 0 && <ReauthNotice items={plaidAttention} />}
      </Fragment>
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
              <div
                data-perf="hero"
                className="mt-2 font-serif text-[48px] leading-none tracking-[-0.03em] tabular-nums md:text-[64px]"
              >
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
            {/* Range selector (desktop) - translucent pills on the green */}
            <div className="hidden gap-0.5 rounded-full bg-white/10 p-1 sm:flex">
              {RANGES.map((r) => (
                // 44px hit area on a 28px pill: the button carries the target,
                // the inner span carries the look. Negative margin keeps the
                // track its original height.
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  aria-pressed={range === r.id}
                  className={
                    '-my-2 inline-flex min-h-[44px] items-center justify-center rounded-full transition-colors ' +
                    (range === r.id ? 'text-white' : 'text-white/55 hover:text-white')
                  }
                >
                  <span
                    className={
                      'rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ' +
                      (range === r.id ? 'bg-white/20' : '')
                    }
                  >
                    {r.id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Area chart */}
          <div className="relative mt-5 -mx-1">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              preserveAspectRatio="none"
              className="block h-[150px] w-full cursor-crosshair touch-pan-y"
              onPointerMove={handleScrub}
              onPointerLeave={() => setScrubIdx(null)}
              onPointerUp={() => setScrubIdx(null)}
              // touch-pan-y hands a vertical drag to the page; the browser
              // then cancels the pointer, so the crosshair is cleared here
              // instead of being stranded mid-chart.
              onPointerCancel={() => setScrubIdx(null)}
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
          <div className="relative mt-1 flex gap-1 sm:hidden">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                aria-pressed={range === r.id}
                className={
                  'flex min-h-[44px] flex-1 items-center justify-center rounded-full transition-colors ' +
                  (range === r.id ? 'text-white' : 'text-white/55')
                }
              >
                <span
                  className={
                    'w-full rounded-full py-1.5 text-center text-[11px] font-semibold transition-all ' +
                    (range === r.id ? 'bg-white/20' : '')
                  }
                >
                  {r.id}
                </span>
              </button>
            ))}
          </div>
        </section>
      </Reveal>
    ),
    accounts: (
      <section key="accounts">
        <div className="mb-3 flex items-baseline justify-between">
          <MapleLabel>Accounts</MapleLabel>
          <Link href="/accounts" className="-my-3 inline-flex min-h-[44px] items-center py-3 text-[12px] font-semibold text-leaf hover:underline">
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
          <div className="hide-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:px-0 md:overflow-visible">
            {accounts.slice(0, 6).map((a, i) => {
              const isFlipped = !!flipped[a.id]
              const isLiability = LIABILITY_TYPES.has(a.type)
              const negative = a.balance_cents < 0 || isLiability
              // Explicit minus for anything owing, matching /accounts: a
              // liability reads "-$4,321.00", never a bare red positive.
              const displayCents = negative ? -Math.abs(a.balance_cents) : a.balance_cents
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
                      {/* front - paper card */}
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
                            <Amount
                              cents={displayCents}
                              tone={negative ? 'maple' : 'ink'}
                              sign={negative ? 'auto' : 'none'}
                            />
                          </PrivacyBlur>
                        </div>
                        <div className="flex-1" />
                        <div className="text-[11px] text-ink-3">
                          {a.ownership === 'shared' ? 'Shared' : 'Personal'} · tap to flip
                        </div>
                      </div>
                      {/* back - this-month stats. Both gradient stops are tokens
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
                          <div className="mt-1 truncate font-serif text-[16px] leading-tight tracking-[-0.01em] opacity-95">
                            {a.name}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <div className="opacity-60">{isLoan ? 'Charged' : 'Out'}</div>
                            <div className="font-serif text-[16px] leading-tight tabular-nums">
                              <PrivacyBlur hidden={hidden}>
                                {formatMoney(a.month_outflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div>
                            <div className="opacity-60">{isLoan ? 'Paid' : 'In'}</div>
                            <div className="font-serif text-[16px] leading-tight tabular-nums">
                              <PrivacyBlur hidden={hidden}>
                                {formatMoney(a.month_inflow_cents)}
                              </PrivacyBlur>
                            </div>
                          </div>
                          <div className="col-span-2 flex items-end justify-between border-t border-white/15 pt-2">
                            <div>
                              <div className="opacity-60">Net</div>
                              <div
                                className="font-serif text-[18px] leading-tight tabular-nums"
                                style={{ color: monthNet >= 0 ? '#bdf0d2' : '#ffb6a3' }}
                              >
                                <PrivacyBlur hidden={hidden}>
                                  {formatMoneySigned(monthNet, { plus: true })}
                                </PrivacyBlur>
                              </div>
                            </div>
                            <div className="text-right opacity-70">
                              <div className="text-[10px] uppercase tracking-[0.08em]">Activity</div>
                              <div className="font-serif text-[14px] leading-tight tabular-nums">
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
  }

  return (
    <HideBalancesContext.Provider value={hidden}>
    <div className="flex flex-col gap-6 pb-10">
      {/* A failed query means a card would otherwise read $0 - surface it so the
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

      {/* Primary action. Mobile: the tab bar's centre "+" (registered above).
          Desktop: an inline leaf button top-right of the page so it stays
          reachable even when the greeting widget is hidden. Both open the
          same add-transaction sheet. */}
      {accounts.length > 0 && (
        <>
          <div className="hidden items-center justify-end md:flex">
            <Button variant="primary" size="md" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              Add transaction
            </Button>
          </div>
          {addOpen && (
            <AddTransactionSheet
              onClose={() => setAddOpen(false)}
              defaultDate={currentMonthISO}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
              categories={categories}
            />
          )}
        </>
      )}

      {layout.map((id) => (
        <Fragment key={id}>{widgets[id] ?? slots[id]}</Fragment>
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
    </HideBalancesContext.Provider>
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
