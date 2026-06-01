import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { addMonths, monthLabel, monthStartISO } from '@/lib/format'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { PageHeader } from '@/components/ui/page-header'
import { MonthNav } from '@/components/ui/month-nav'
import { StatTile } from '@/components/ui/stat-tile'
import { Card } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { Amount } from '@/components/ui/amount'
import { MapleLabel } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { BalanceSheetPanel } from './panel'

/**
 * Balance sheet — assets vs liabilities as of the selected month, grouped by
 * account type. For each account we use the latest snapshot with
 * `as_of_month <= selected month`; if none exists we fall back to the opening
 * balance. An "Update balances" sheet writes a snapshot for the selected month.
 */
export default async function BalanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const month =
    params.month && /^\d{4}-\d{2}-01$/.test(params.month) ? params.month : monthStartISO()
  const prevMonth = addMonths(month, -1)

  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: accounts }, { data: snapshots }, { data: members }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, ownership, member_id, opening_balance_cents')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents, as_of_month')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: false }),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId),
  ])

  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))

  // Snapshots arrive newest-first. Index them per account so we can resolve the
  // balance "as of" any month: the first snapshot at-or-before the target.
  const snapsByAcct = new Map<string, { as_of: string; cents: number }[]>()
  for (const s of snapshots ?? []) {
    const arr = snapsByAcct.get(s.account_id) ?? []
    arr.push({ as_of: s.as_of_month as string, cents: Number(s.balance_cents) })
    snapsByAcct.set(s.account_id, arr)
  }
  const balanceAsOf = (acctId: string, opening: number, target: string, inclusive = true) => {
    const snaps = snapsByAcct.get(acctId) ?? []
    const found = snaps.find((s) => (inclusive ? s.as_of <= target : s.as_of < target))
    return found ? found.cents : opening
  }
  const snapshotAt = (acctId: string, target: string): number | null => {
    const snaps = snapsByAcct.get(acctId) ?? []
    const found = snaps.find((s) => s.as_of === target)
    return found ? found.cents : null
  }

  type Row = {
    id: string
    name: string
    type: string
    typeLabel: string
    ownerLabel: string
    cents: number
    isLiability: boolean
  }
  const rows: Row[] = (accounts ?? []).map((a) => {
    const opening = Number(a.opening_balance_cents)
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      typeLabel: accountTypeLabel(a.type),
      ownerLabel:
        a.ownership === 'shared'
          ? 'Shared'
          : (a.member_id && memberName.get(a.member_id)) || 'Member',
      cents: balanceAsOf(a.id, opening, month),
      isLiability: LIABILITY_TYPES.has(a.type as AccountType),
    }
  })

  const assetRows = rows.filter((r) => !r.isLiability)
  const liabRows = rows.filter((r) => r.isLiability)
  const totalAssets = assetRows.reduce((s, r) => s + r.cents, 0)
  const totalLiab = liabRows.reduce((s, r) => s + r.cents, 0)
  const netWorth = totalAssets - totalLiab

  // Group rows by type for display.
  const grp = (list: Row[]) => {
    const by = new Map<string, Row[]>()
    for (const r of list) {
      const arr = by.get(r.typeLabel) ?? []
      arr.push(r)
      by.set(r.typeLabel, arr)
    }
    return [...by.entries()].map(([label, items]) => ({
      label,
      items: items.sort((a, b) => b.cents - a.cents),
      subtotal: items.reduce((s, i) => s + i.cents, 0),
    }))
  }
  const assetGroups = grp(assetRows)
  const liabGroups = grp(liabRows)

  // Shape rows for the "Update balances" form: opening, the snapshot saved
  // exactly at the selected month (editable), and the prior-month balance.
  const formAccounts = (accounts ?? []).map((a) => {
    const opening = Number(a.opening_balance_cents)
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      typeLabel: accountTypeLabel(a.type),
      memberName: a.member_id ? memberName.get(a.member_id) ?? null : null,
      ownership: a.ownership as string,
      opening_balance_cents: opening,
      current_balance_cents: snapshotAt(a.id, month),
      previous_balance_cents: balanceAsOf(a.id, opening, prevMonth),
      is_liability: LIABILITY_TYPES.has(a.type as AccountType),
    }
  })

  const monthName = monthLabel(month)
  const hasAccounts = rows.length > 0

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Balance sheet"
        title="What you own, what you owe."
        subtitle={`A snapshot of assets and liabilities as of ${monthName}.`}
        actions={
          hasAccounts ? (
            <BalanceSheetPanel month={month} monthName={monthName} accounts={formAccounts} />
          ) : undefined
        }
      />

      {!hasAccounts ? (
        <EmptyState
          title="No accounts yet"
          body="Add your chequing, savings, investment, and loan accounts to start tracking net worth."
          action={
            <Link href="/accounts">
              <Button variant="primary" size="md">
                Go to accounts
              </Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <MonthNav monthISO={month} makeHref={(iso) => `/balance-sheet?month=${iso}`} />
            <span className="text-[12px] text-ink-3">As of {monthName}</span>
          </div>

          {/* Summary bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label={`Net worth · ${monthName}`}
              tone={netWorth >= 0 ? 'ink' : 'maple'}
              value={<Amount cents={netWorth} sign="auto" tone="auto" />}
              foot={netWorth < 0 ? 'Liabilities exceed assets' : undefined}
              className="col-span-2 sm:col-span-1"
            />
            <StatTile
              label={`Assets · ${monthName}`}
              tone="leaf"
              value={<Amount cents={totalAssets} tone="leaf" />}
            />
            <StatTile
              label={`Liabilities · ${monthName}`}
              tone="maple"
              value={<Amount cents={totalLiab} tone="maple" />}
              foot={totalLiab > 0 ? 'Owing' : undefined}
            />
          </div>

          {/* Two-column ledger */}
          <div className="grid gap-5 md:grid-cols-2">
            <Ledger
              title="Assets"
              monthName={monthName}
              groups={assetGroups}
              total={totalAssets}
              tone="leaf"
            />
            <Ledger
              title="Liabilities"
              monthName={monthName}
              groups={liabGroups}
              total={totalLiab}
              tone="maple"
            />
          </div>
        </>
      )}
    </div>
  )
}

function Ledger({
  title,
  monthName,
  groups,
  total,
  tone,
}: {
  title: string
  monthName: string
  groups: {
    label: string
    items: { id: string; name: string; ownerLabel: string; cents: number }[]
    subtotal: number
  }[]
  total: number
  tone: 'leaf' | 'maple'
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
        <MapleLabel>{title}</MapleLabel>
        <Amount cents={total} tone={tone} className="text-[18px]" />
      </div>
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ink-2">None as of {monthName}.</p>
      ) : (
        <DataTable minWidth={360}>
          <tbody>
            {groups.map((g) => (
              <GroupRows key={g.label} group={g} />
            ))}
          </tbody>
        </DataTable>
      )}
    </Card>
  )
}

function GroupRows({
  group,
}: {
  group: {
    label: string
    items: { id: string; name: string; ownerLabel: string; cents: number }[]
    subtotal: number
  }
}) {
  return (
    <>
      <tr className="border-t border-hair bg-cream-2 first:border-t-0">
        <th
          scope="rowgroup"
          className="px-5 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3"
        >
          {group.label}
        </th>
        <td className="px-5 py-2 text-right text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3 tabular-nums">
          <Amount cents={group.subtotal} className="font-sans text-[12px] font-bold text-ink-3" />
        </td>
      </tr>
      {group.items.map((i) => (
        <tr key={i.id} className="border-t border-hair">
          <td className="px-5 py-2.5">
            <div className="truncate text-[14px] text-ink">{i.name}</div>
            <div className="text-[11.5px] text-ink-3">{i.ownerLabel}</div>
          </td>
          <td className="px-5 py-2.5 text-right align-middle">
            <Amount cents={i.cents} className="text-[15px] text-ink" />
          </td>
        </tr>
      ))}
    </>
  )
}
