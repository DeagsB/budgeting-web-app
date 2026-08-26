import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PageHeader } from '@/components/ui/page-header'
import { StatTile } from '@/components/ui/stat-tile'
import { Amount } from '@/components/ui/amount'
import { ResponsiveAmount } from '@/components/ui/responsive-amount'
import { ContributionTable } from './table'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

type RegisteredType = 'tfsa' | 'rrsp' | 'fhsa'
const TYPES: RegisteredType[] = ['tfsa', 'rrsp', 'fhsa']
const TYPE_LABEL: Record<RegisteredType, string> = {
  tfsa: 'TFSA',
  rrsp: 'RRSP',
  fhsa: 'FHSA',
}

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const params = await searchParams
  const currentYear = new Date().getFullYear()
  const year =
    params.year && /^\d{4}$/.test(params.year) ? parseInt(params.year, 10) : currentYear

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const yearStart = `${year}-01-01`
  const nextYearStart = `${year + 1}-01-01`
  const priorYearStart = `${year - 1}-01-01`

  const [
    { data: members },
    { data: accounts },
    { data: rooms },
    { data: priorRooms },
    { data: limits },
    { data: transactions },
    { data: priorTransactions },
  ] = await Promise.all([
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('accounts')
      .select('id, member_id, type')
      .eq('household_id', ctx.householdId)
      .in('type', TYPES)
      .is('archived_at', null),
    supabase
      .from('member_contribution_rooms')
      .select('member_id, account_type, year, opening_room_cents, annual_allowance_override_cents')
      .eq('household_id', ctx.householdId)
      .eq('year', year),
    supabase
      .from('member_contribution_rooms')
      .select('member_id, account_type, year, opening_room_cents, annual_allowance_override_cents')
      .eq('household_id', ctx.householdId)
      .eq('year', year - 1),
    supabase.from('cra_annual_limits').select('year, account_type, annual_limit_cents, note'),
    supabase
      .from('transactions')
      .select('account_id, amount_cents')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', yearStart)
      .lt('occurred_on', nextYearStart),
    supabase
      .from('transactions')
      .select('account_id, amount_cents')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', priorYearStart)
      .lt('occurred_on', yearStart),
  ])

  const memberRows = members ?? []
  const accountRows = accounts ?? []
  const roomRows = rooms ?? []
  const priorRoomRows = priorRooms ?? []
  const limitRows = limits ?? []
  const txRows = transactions ?? []
  const priorTxRows = priorTransactions ?? []

  const accountsByMemberType = new Map<string, string[]>()
  for (const a of accountRows) {
    if (!a.member_id) continue
    const key = `${a.member_id}:${a.type}`
    if (!accountsByMemberType.has(key)) accountsByMemberType.set(key, [])
    accountsByMemberType.get(key)!.push(a.id)
  }

  function netsByAccount(rows: { account_id: string; amount_cents: number }[]): Map<
    string,
    { contributed: number; withdrawn: number }
  > {
    const out = new Map<string, { contributed: number; withdrawn: number }>()
    for (const tx of rows) {
      const amt = Number(tx.amount_cents)
      const entry = out.get(tx.account_id) ?? { contributed: 0, withdrawn: 0 }
      if (amt > 0) entry.contributed += amt
      else entry.withdrawn += -amt
      out.set(tx.account_id, entry)
    }
    return out
  }

  const netThisYear = netsByAccount(txRows)
  const netPriorYear = netsByAccount(priorTxRows)

  const limitByYearType = new Map<string, { amount: number; note: string | null }>()
  for (const l of limitRows)
    limitByYearType.set(`${l.year}:${l.account_type}`, {
      amount: Number(l.annual_limit_cents),
      note: l.note ?? null,
    })

  const roomByMemberType = new Map<
    string,
    { opening: number; allowanceOverride: number | null }
  >()
  for (const r of roomRows)
    roomByMemberType.set(`${r.member_id}:${r.account_type}`, {
      opening: Number(r.opening_room_cents),
      allowanceOverride:
        r.annual_allowance_override_cents !== null
          ? Number(r.annual_allowance_override_cents)
          : null,
    })

  const priorRoomByMemberType = new Map<
    string,
    { opening: number; allowanceOverride: number | null }
  >()
  for (const r of priorRoomRows)
    priorRoomByMemberType.set(`${r.member_id}:${r.account_type}`, {
      opening: Number(r.opening_room_cents),
      allowanceOverride:
        r.annual_allowance_override_cents !== null
          ? Number(r.annual_allowance_override_cents)
          : null,
    })

  function sumAcrossAccounts(
    memberId: string,
    type: RegisteredType,
    map: Map<string, { contributed: number; withdrawn: number }>,
  ): { contributed: number; withdrawn: number } {
    const accountIds = accountsByMemberType.get(`${memberId}:${type}`) ?? []
    let contributed = 0
    let withdrawn = 0
    for (const aid of accountIds) {
      const net = map.get(aid)
      if (!net) continue
      contributed += net.contributed
      withdrawn += net.withdrawn
    }
    return { contributed, withdrawn }
  }

  // Compute prior-year closing balance per (member, type), used to seed
  // current-year opening room for TFSA (withdrawals restore) and FHSA
  // (withdrawals do NOT restore).
  function priorYearClosing(memberId: string, type: RegisteredType): number {
    const key = `${memberId}:${type}`
    const priorRoom = priorRoomByMemberType.get(key)
    const priorLimit = limitByYearType.get(`${year - 1}:${type}`)?.amount ?? 0
    const priorAllowance =
      priorRoom?.allowanceOverride !== undefined && priorRoom?.allowanceOverride !== null
        ? priorRoom.allowanceOverride
        : priorLimit
    const priorOpening = priorRoom?.opening ?? 0
    const { contributed, withdrawn } = sumAcrossAccounts(memberId, type, netPriorYear)

    // Prior closing = opening + allowance − contributions
    const closing = priorOpening + priorAllowance - contributed
    if (type === 'tfsa') {
      // TFSA: withdrawals during the year restore room on Jan 1 of the
      // following year. So add withdrawn to the closing as carried room.
      return closing + withdrawn
    }
    // RRSP + FHSA: no automatic restore from withdrawals.
    return closing
  }

  type RowVM = {
    member_id: string
    memberName: string
    type: RegisteredType
    opening: number
    openingIsSuggestion: boolean
    suggestedOpeningCents: number | null
    allowanceOverride: number | null
    craAllowance: number
    contributed: number
    withdrawn: number
  }
  const rowsVM: RowVM[] = []
  for (const m of memberRows) {
    for (const type of TYPES) {
      const key = `${m.id}:${type}`
      const roomEntry = roomByMemberType.get(key)
      const limitEntry = limitByYearType.get(`${year}:${type}`)
      const { contributed, withdrawn } = sumAcrossAccounts(m.id, type, netThisYear)

      const hasPersisted = roomEntry !== undefined
      const suggested = priorYearClosing(m.id, type)
      const opening = hasPersisted ? (roomEntry?.opening ?? 0) : suggested

      rowsVM.push({
        member_id: m.id,
        memberName: m.display_name,
        type,
        opening,
        openingIsSuggestion: !hasPersisted && suggested !== 0,
        suggestedOpeningCents: !hasPersisted && suggested !== 0 ? suggested : null,
        allowanceOverride: roomEntry?.allowanceOverride ?? null,
        craAllowance: limitEntry?.amount ?? 0,
        contributed,
        withdrawn,
      })
    }
  }

  const totals = rowsVM.reduce(
    (acc, r) => {
      const allowance = r.allowanceOverride ?? r.craAllowance
      const available = r.opening + allowance - r.contributed
      acc.opening += r.opening
      acc.allowance += allowance
      acc.contributed += r.contributed
      acc.available += available
      return acc
    },
    { opening: 0, allowance: 0, contributed: 0, available: 0 },
  )

  const isCurrentYear = year === currentYear

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow={`Contributions · ${year}`}
        title="TFSA, RRSP, FHSA — room left."
        subtitle="Carry-forward room and current-year contributions per member, with the CRA annual allowance applied. Override anything if your Notice of Assessment shows a different number."
      />

      <nav aria-label="Choose year" className="grid grid-cols-3 gap-2 text-[13px]">
        <Link
          href={{ pathname: '/contributions', query: { year: year - 1 } }}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hair bg-paper px-3 font-medium text-ink-2 hover:text-ink"
        >
          ← {year - 1}
        </Link>
        <Link
          href={{ pathname: '/contributions', query: { year: currentYear } }}
          aria-current={isCurrentYear ? 'page' : undefined}
          className={
            isCurrentYear
              ? 'inline-flex min-h-[44px] items-center justify-center rounded-full border border-leaf bg-leaf-tint px-3 font-semibold text-leaf-deep'
              : 'inline-flex min-h-[44px] items-center justify-center rounded-full border border-hair bg-paper px-3 font-medium text-ink-2 hover:text-ink'
          }
        >
          This year
        </Link>
        <Link
          href={{ pathname: '/contributions', query: { year: year + 1 } }}
          className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-full border border-hair bg-paper px-3 font-medium text-ink-2 hover:text-ink"
        >
          {year + 1} →
        </Link>
      </nav>

      {/* "Available" is the number people come here for, so it stays the
          hero; the three inputs that produce it share one compact row. */}
      <section className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
        <StatTile
          label="Available"
          value={<Amount cents={totals.available} tone={totals.available < 0 ? 'maple' : 'leaf'} />}
          tone={totals.available < 0 ? 'maple' : 'leaf'}
          foot={totals.available < 0 ? 'over contributed' : undefined}
          className="col-span-3 sm:col-span-1"
        />
        <StatTile compact label="Opening" value={<ResponsiveAmount cents={totals.opening} />} hint="Jan 1" className="sm:p-4" />
        <StatTile compact label="Allowance" value={<ResponsiveAmount cents={totals.allowance} />} hint={String(year)} className="sm:p-4" />
        <StatTile compact label="Contributed" value={<ResponsiveAmount cents={totals.contributed} />} hint={String(year)} className="sm:p-4" />
      </section>

      {memberRows.length === 0 ? (
        <EmptyState
          title="No members yet"
          body="Contribution room is tracked per household member. Add at least one member to start tracking RRSP, TFSA and FHSA room."
          action={
            <Link href="/setup">
              <Button variant="primary" size="md">
                Manage members
              </Button>
            </Link>
          }
        />
      ) : (
        <ContributionTable
          year={year}
          rows={rowsVM.map((r) => ({
            ...r,
            typeLabel: TYPE_LABEL[r.type],
          }))}
        />
      )}

      <p className="rounded-md border border-hair bg-paper-2 px-4 py-3 text-[12px] leading-relaxed text-ink-2">
        Opening room is the carry-forward balance at Jan 1. For <span className="font-semibold text-ink">RRSP</span>, paste the
        number from your latest Notice of Assessment; for <span className="font-semibold text-ink">TFSA</span>/FHSA, the app suggests
        next year&apos;s opening based on prior-year data (TFSA includes withdrawals that restore
        on Jan 1; FHSA + RRSP do not). Suggested values appear as placeholders — edit and hit Save
        to lock them in. Allowance defaults to the CRA annual limit; use the override to paste a
        personalised figure.
      </p>
    </div>
  )
}
