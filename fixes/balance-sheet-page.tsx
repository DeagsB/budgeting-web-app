import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney } from '@/lib/format'
import { accountTypeLabel, LIABILITY_TYPES } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'

/**
 * Balance sheet — assets vs liabilities at this moment, grouped by account
 * type. Uses latest snapshot per account; falls back to opening balance.
 */
export default async function BalanceSheetPage() {
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
      .from('account_snapshots')
      .select('account_id, balance_cents, as_of')
      .eq('household_id', ctx.householdId)
      .order('as_of', { ascending: false }),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId),
  ])

  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))
  const latestSnap = new Map<string, number>()
  for (const s of snapshots ?? []) {
    if (!latestSnap.has(s.account_id)) latestSnap.set(s.account_id, Number(s.balance_cents))
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
  const rows: Row[] = (accounts ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    typeLabel: accountTypeLabel(a.type),
    ownerLabel:
      a.ownership === 'shared'
        ? 'Shared'
        : (a.member_id && memberName.get(a.member_id)) || 'Member',
    cents: latestSnap.get(a.id) ?? Number(a.opening_balance_cents),
    isLiability: LIABILITY_TYPES.has(a.type as never),
  }))

  const assetRows = rows.filter((r) => !r.isLiability)
  const liabRows = rows.filter((r) => r.isLiability)
  const totalAssets = assetRows.reduce((s, r) => s + r.cents, 0)
  const totalLiab = liabRows.reduce((s, r) => s + r.cents, 0)
  const netWorth = totalAssets - totalLiab

  // Group rows by type for display
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

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Balance sheet
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          What you own, what you owe.
        </h1>
      </header>

      {/* Net worth hero */}
      <section
        className="rounded-[24px] border border-[var(--color-hair)] p-6 md:p-8"
        style={{ background: 'var(--color-cream-2)' }}
      >
        <MapleLabel>Net worth · today</MapleLabel>
        <div
          className="mt-2 font-serif text-[52px] leading-none tracking-[-0.03em] tabular-nums md:text-[64px]"
          style={{ color: netWorth >= 0 ? 'var(--color-ink)' : 'var(--color-maple)' }}
        >
          {netWorth < 0 ? '−' : ''}
          {formatMoney(Math.abs(netWorth))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--color-hair)] pt-4 text-[13px] md:max-w-[420px]">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              Assets
            </div>
            <div className="mt-1 font-serif text-[20px] tabular-nums text-[var(--color-leaf)]">
              {formatMoney(totalAssets)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              Liabilities
            </div>
            <div className="mt-1 font-serif text-[20px] tabular-nums text-[var(--color-maple)]">
              {formatMoney(totalLiab)}
            </div>
          </div>
        </div>
      </section>

      {/* Two-column ledger */}
      <div className="grid gap-5 md:grid-cols-2">
        <Ledger title="Assets" groups={assetGroups} total={totalAssets} tone="leaf" />
        <Ledger title="Liabilities" groups={liabGroups} total={totalLiab} tone="maple" />
      </div>
    </div>
  )
}

function Ledger({
  title,
  groups,
  total,
  tone,
}: {
  title: string
  groups: { label: string; items: { id: string; name: string; ownerLabel: string; cents: number }[]; subtotal: number }[]
  total: number
  tone: 'leaf' | 'maple'
}) {
  const color = tone === 'leaf' ? 'var(--color-leaf)' : 'var(--color-maple)'
  return (
    <section className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
      <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
        <MapleLabel>{title}</MapleLabel>
        <span className="font-serif text-[18px] tabular-nums" style={{ color }}>
          {formatMoney(total)}
        </span>
      </header>
      {groups.length === 0 && (
        <p className="px-5 py-8 text-center text-[13.5px] text-[var(--color-ink-2)]">
          None.
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label} className="border-b border-[var(--color-hair)] last:border-b-0">
          <div className="flex items-baseline justify-between px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            <span>{g.label}</span>
            <span className="tabular-nums">{formatMoney(g.subtotal)}</span>
          </div>
          <ul>
            {g.items.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between gap-3 border-t border-[var(--color-hair)] px-5 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[14px] text-[var(--color-ink)]">{i.name}</div>
                  <div className="text-[11.5px] text-[var(--color-ink-3)]">{i.ownerLabel}</div>
                </div>
                <span className="shrink-0 font-serif text-[15px] tabular-nums text-[var(--color-ink)]">
                  {formatMoney(i.cents)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
