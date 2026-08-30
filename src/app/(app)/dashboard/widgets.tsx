// Display-only dashboard widgets, rendered on the server. They ship no
// component JS of their own: everything interactive inside them is a small
// client leaf (PrivacyBlur follows the eye toggle through
// HideBalancesContext, Reveal is a CSS-animation wrapper). The dashboard
// client receives them as ready-made slots and only orders them.
import Link from 'next/link'
import { formatMoney, formatDate } from '@/lib/format'
import { colorForCategory } from '@/lib/category-colors'
import { Amount } from '@/components/ui/amount'
import { Card } from '@/components/ui/card'
import { MapleLabel } from '@/components/ui/label'
import { PrivacyBlur } from '@/components/ui/privacy-blur'
import { Reveal } from '@/components/ui/reveal'
import { StatTile } from '@/components/ui/stat-tile'
import type {
  CategoryBudgetVM,
  GoalVM,
  InboxVM,
  PaceVM,
  RecentTxVM,
  RecurringVM,
  SpendBucket,
} from './client'

export function InboxWidget({ inbox }: { inbox: InboxVM }) {
  if (inbox.count === 0) {
    return (
      <p className="text-center text-[13px] text-ink-2">
        Everything is categorized
      </p>
    )
  }
  const href = inbox.hasEarlierMonths ? '/transactions?scope=uncategorized' : '/transactions'
  return (
    <Card padding="lg">
      <div className="font-serif text-[24px] leading-tight text-ink md:text-[28px]">
        {inbox.count} to categorize
      </div>
      <div className="mt-1 text-[13.5px] text-ink-2">
        <PrivacyBlur>
          {formatMoney(inbox.amountCents)} across {inbox.accountCount} account
          {inbox.accountCount === 1 ? '' : 's'}
        </PrivacyBlur>
      </div>
      <Link
        href={href}
        className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-full bg-leaf text-[14px] font-semibold text-paper shadow-[var(--shadow-card)] transition-transform active:scale-[0.97]"
      >
        Categorize
      </Link>
    </Card>
  )
}

export function MonthStatsWidget({ income, expenses, net }: { income: number; expenses: number; net: number }) {
  return (
    <section className="grid grid-cols-3 gap-3">
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
              <PrivacyBlur>
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
  )
}

export function BudgetLeftWidget({ categoryBudgets }: { categoryBudgets: CategoryBudgetVM[] }) {
  return (
    <Card padding="none">
      <div className="p-6">
        <MapleLabel>Left to spend</MapleLabel>
        {categoryBudgets.length === 0 ? (
          <div className="mt-2 text-[13.5px] text-ink-2">
            No budgets yet.{' '}
            <Link href="/budgets" className="font-semibold text-leaf underline">
              Add some
            </Link>
            .
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {categoryBudgets.map((c) => {
              const over = c.left < 0
              const pct = c.budget > 0 ? Math.min(1, c.spent / c.budget) : 0
              return (
                <li key={c.id}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.name}</span>
                    <span className={`shrink-0 font-semibold ${over ? 'text-maple' : 'text-leaf'}`}>
                      <PrivacyBlur>
                        {over ? `${formatMoney(-c.left)} over` : `${formatMoney(c.left)} left`}
                      </PrivacyBlur>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper-2">
                    <div
                      role="progressbar"
                      aria-label={`${c.name} spent`}
                      aria-valuenow={Math.round(pct * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round(pct * 100)}%`,
                        background: over ? 'var(--color-maple)' : 'var(--color-leaf)',
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {/* Footer link - a full-width tap target under a divider, distinct
          from the header-row "See all →" pattern the other widgets use.
          Skipped when empty: the "Add some" link above already covers it. */}
      {categoryBudgets.length > 0 && (
        <Link
          href="/budgets"
          className="flex min-h-[44px] items-center justify-center border-t border-hair text-[12.5px] font-semibold text-leaf transition-colors hover:bg-cream-2"
        >
          See all budgets →
        </Link>
      )}
    </Card>
  )
}

export function SpendingWidget({ spendingBreakdown }: { spendingBreakdown: SpendBucket[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <MapleLabel>Where it went</MapleLabel>
        <Link href="/budgets" className="-my-3 inline-flex min-h-[44px] items-center py-3 text-[12px] font-semibold text-leaf hover:underline">
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
                    <PrivacyBlur>
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
  )
}

export function BudgetProgressWidget({ totalBudget, expenses }: { totalBudget: number; expenses: number }) {
  const pct = totalBudget > 0 ? Math.min(1.2, expenses / totalBudget) : 0
  const over = pct > 1
  const breakpoint = over ? 100 / pct : null
  return (
    <Card padding="lg">
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Budget</MapleLabel>
        <Link
          href="/budgets"
          className="-my-3 inline-flex min-h-[44px] items-center py-3 text-[12px] font-semibold text-leaf hover:underline"
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
            <PrivacyBlur>
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
}

export function PaceWidget({ pace }: { pace: PaceVM }) {
  const isCurrentMonth = pace.daysElapsed > 0 && pace.daysElapsed < pace.daysInMonth
  return (
    <Card padding="lg">
      <MapleLabel>Pace</MapleLabel>
      {!isCurrentMonth ? (
        <div className="mt-1.5 text-[13.5px] text-ink-2">
          {pace.daysElapsed === 0 ? 'Future month - no pace yet.' : 'Month complete.'}
        </div>
      ) : (
        <>
          <div className="mt-1.5 text-[24px] leading-tight md:text-[28px]">
            <PrivacyBlur>
              <Amount cents={pace.dailyPace} />
            </PrivacyBlur>
            <span className="font-serif text-[14px] font-normal text-ink-3">/day</span>
          </div>
          <div className="mt-1 text-[12.5px] text-ink-2">
            Day {pace.daysElapsed} of {pace.daysInMonth} · projected{' '}
            <span className="font-semibold tabular-nums text-ink">
              <PrivacyBlur>{formatMoney(pace.projectedMonth)}</PrivacyBlur>
            </span>{' '}
            this month
          </div>
        </>
      )}
    </Card>
  )
}

export function RecurringWidget({ recurring, recurringTotal }: { recurring: RecurringVM[]; recurringTotal: number }) {
  return (
    <Card padding="lg">
      <div className="flex items-baseline justify-between gap-2">
        <MapleLabel>Recurring</MapleLabel>
        <span className="text-[10.5px] tabular-nums text-ink-3">
          {recurring.length} item{recurring.length === 1 ? '' : 's'}
        </span>
      </div>
      {recurring.length === 0 ? (
        <div className="mt-1.5 text-[13.5px] text-ink-2">
          Nothing detected yet - recurring transactions appear here once we see them in 2+ of the last 3 months.
        </div>
      ) : (
        <>
          <div className="mt-1.5 text-[24px] leading-tight md:text-[28px]">
            <PrivacyBlur>
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
                  <PrivacyBlur>
                    <Amount cents={g.amount_cents} />
                  </PrivacyBlur>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

export function GoalsWidget({ goals }: { goals: GoalVM[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <MapleLabel>Goals</MapleLabel>
        <Link href="/goals" className="-my-3 inline-flex min-h-[44px] items-center py-3 text-[12px] font-semibold text-leaf hover:underline">
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
                    <PrivacyBlur>
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
  )
}

export function RecentActivityWidget({ recentActivity }: { recentActivity: RecentTxVM[] }) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <MapleLabel>Recent activity</MapleLabel>
        <Link href="/transactions" className="-my-3 inline-flex min-h-[44px] items-center py-3 text-[12px] font-semibold text-leaf hover:underline">
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
                  <PrivacyBlur>
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
  )
}
