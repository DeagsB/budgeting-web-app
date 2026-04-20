import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney } from '@/lib/format'
import { ContributionTable } from './table'

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

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Registered contributions</h1>
          <p className="mt-1 text-sm text-gray-500">
            TFSA / RRSP / FHSA room and usage per member for {year}.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href={{ pathname: '/contributions', query: { year: year - 1 } }}
            className="text-gray-500 hover:text-gray-900"
          >
            ← {year - 1}
          </Link>
          <Link
            href={{ pathname: '/contributions', query: { year: currentYear } }}
            className="text-gray-500 hover:text-gray-900"
          >
            This year
          </Link>
          <Link
            href={{ pathname: '/contributions', query: { year: year + 1 } }}
            className="text-gray-500 hover:text-gray-900"
          >
            {year + 1} →
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-4">
        <Tile label="Opening room (Jan 1)" value={formatMoney(totals.opening)} />
        <Tile label={`${year} allowance`} value={formatMoney(totals.allowance)} />
        <Tile label={`Contributed ${year}`} value={formatMoney(totals.contributed)} />
        <Tile label="Available" value={formatMoney(totals.available)} color="text-green-700" />
      </section>

      {memberRows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Add members first.
        </p>
      ) : (
        <ContributionTable
          year={year}
          rows={rowsVM.map((r) => ({
            ...r,
            typeLabel: TYPE_LABEL[r.type],
          }))}
        />
      )}

      <p className="text-xs text-gray-500">
        Opening room is the carry-forward balance at Jan 1. For RRSP, paste the number from your
        latest Notice of Assessment; for TFSA/FHSA, the app suggests next year&apos;s opening based
        on prior year data (TFSA includes withdrawals that restore on Jan 1; FHSA + RRSP do not).
        Suggested values appear as placeholders — edit and hit Save to lock them in. Allowance
        defaults to the CRA annual limit; use the override to paste a personalised figure
        (essential for RRSP).
      </p>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}
