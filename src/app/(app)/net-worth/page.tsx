import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney, addMonths, monthStartISO, monthLabel } from '@/lib/format'
import { LIABILITY_TYPES } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'

/**
 * Net worth — 24-month trail drawn as a big serif-feeling area chart with
 * assets/liabilities split underneath.
 */
export default async function NetWorthPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: accounts }, { data: snapshots }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, as_of_month, balance_cents')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: true }),
  ])

  const snapsByAcct = new Map<string, { as_of: string; cents: number }[]>()
  for (const s of snapshots ?? []) {
    const arr = snapsByAcct.get(s.account_id) ?? []
    arr.push({ as_of: s.as_of_month as string, cents: Number(s.balance_cents) })
    snapsByAcct.set(s.account_id, arr)
  }

  // 24-month trail, first of each month
  const today = monthStartISO(new Date())
  const monthStart = addMonths(today, -23)
  const months: string[] = []
  for (let i = 0; i < 24; i += 1) months.push(addMonths(monthStart, i))

  const trail = months.map((m) => {
    let assets = 0
    let liabilities = 0
    for (const a of accounts ?? []) {
      const snaps = snapsByAcct.get(a.id) ?? []
      const priorOrEqual = [...snaps].reverse().find((s) => s.as_of <= m)
      const bal = priorOrEqual ? priorOrEqual.cents : Number(a.opening_balance_cents)
      if (LIABILITY_TYPES.has(a.type as never)) liabilities += bal
      else assets += bal
    }
    return { month: m, assets, liabilities, net: assets - liabilities }
  })

  const latest = trail[trail.length - 1]
  const twelveAgo = trail[trail.length - 13] ?? trail[0]
  const yoy = latest.net - twelveAgo.net

  // SVG dims
  const W = 960
  const H = 280
  const PAD = 24
  const minV = Math.min(0, ...trail.map((t) => t.net))
  const maxV = Math.max(0, ...trail.map((t) => t.net))
  const span = Math.max(1, maxV - minV)
  const x = (i: number) => PAD + (i / Math.max(1, trail.length - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - (v - minV) / span) * (H - PAD * 2)
  const zeroY = y(0)

  const linePath = trail.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(t.net)}`).join(' ')
  const areaPath = `${linePath} L${x(trail.length - 1)},${zeroY} L${x(0)},${zeroY} Z`

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Net worth
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Two years of patience.
        </h1>
      </header>

      {/* Hero */}
      <section
        className="rounded-[24px] border border-[var(--color-hair)] p-6 md:p-8"
        style={{ background: 'var(--color-cream-2)' }}
      >
        <MapleLabel>Today</MapleLabel>
        <div
          className="mt-2 font-serif text-[52px] leading-none tracking-[-0.03em] tabular-nums md:text-[64px]"
          style={{ color: latest.net >= 0 ? 'var(--color-ink)' : 'var(--color-maple)' }}
        >
          {latest.net < 0 ? '−' : ''}
          {formatMoney(Math.abs(latest.net))}
        </div>
        <div className="mt-3 flex items-baseline gap-2 text-[13.5px]">
          <span
            className="font-serif text-[18px] tabular-nums"
            style={{ color: yoy >= 0 ? 'var(--color-leaf)' : 'var(--color-maple)' }}
          >
            {yoy >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(yoy))}
          </span>
          <span className="text-[var(--color-ink-3)]">vs {monthLabel(twelveAgo.month)}</span>
        </div>
      </section>

      {/* Chart */}
      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>24-month trail</MapleLabel>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Net worth over 24 months">
          <defs>
            <linearGradient id="nwFill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-leaf)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-leaf)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Zero line */}
          <line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="var(--color-hair)" strokeDasharray="3 4" />
          {/* Area */}
          <path d={areaPath} fill="url(#nwFill)" />
          {/* Line */}
          <path d={linePath} fill="none" stroke="var(--color-leaf)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {/* Endpoint dot */}
          <circle cx={x(trail.length - 1)} cy={y(latest.net)} r="5" fill="var(--color-paper)" stroke="var(--color-leaf)" strokeWidth="2.5" />
          {/* X-axis month ticks, every 3rd */}
          {trail.map((t, i) =>
            i % 3 === 0 ? (
              <text
                key={t.month}
                x={x(i)}
                y={H - 4}
                textAnchor="middle"
                fontSize="10"
                fontFamily="ui-sans-serif, system-ui"
                fontWeight="600"
                fill="var(--color-ink-3)"
                style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
              >
                {t.month.slice(2, 7)}
              </text>
            ) : null,
          )}
        </svg>
      </section>

      {/* Assets / liabilities split at latest */}
      <section className="grid gap-3 md:grid-cols-2">
        <SplitCard label="Assets · today" value={latest.assets} tone="leaf" />
        <SplitCard label="Liabilities · today" value={latest.liabilities} tone="maple" />
      </section>
    </div>
  )
}

function SplitCard({ label, value, tone }: { label: string; value: number; tone: 'leaf' | 'maple' }) {
  const color = tone === 'leaf' ? 'var(--color-leaf)' : 'var(--color-maple)'
  return (
    <div className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <div
        className="mt-2 font-serif text-[28px] leading-none tracking-[-0.02em] tabular-nums"
        style={{ color }}
      >
        {formatMoney(value)}
      </div>
    </div>
  )
}
