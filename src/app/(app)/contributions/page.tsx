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

  const [
    { data: members },
    { data: accounts },
    { data: rooms },
    { data: limits },
    { data: transactions },
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
    supabase.from('cra_annual_limits').select('year, account_type, annual_limit_cents, note'),
    supabase
      .from('transactions')
      .select('account_id, amount_cents')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', yearStart)
      .lt('occurred_on', nextYearStart),
  ])

  const memberRows = members ?? []
  const accountRows = accounts ?? []
  const roomRows = rooms ?? []
  const limitRows = limits ?? []
  const txRows = transactions ?? []

  const accountsByMemberType = new Map<string, string[]>()
  for (const a of accountRows) {
    if (!a.member_id) continue
    const key = `${a.member_id}:${a.type}`
    if (!accountsByMemberType.has(key)) accountsByMemberType.set(key, [])
    accountsByMemberType.get(key)!.push(a.id)
  }

  const netByAccount = new Map<string, { contributed: number; withdrawn: number }>()
  for (const tx of txRows) {
    const amt = Number(tx.amount_cents)
    const entry = netByAccount.get(tx.account_id) ?? { contributed: 0, withdrawn: 0 }
    if (amt > 0) entry.contributed += amt
    else entry.withdrawn += -amt
    netByAccount.set(tx.account_id, entry)
  }

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

  type RowVM = {
    member_id: string
    memberName: string
    type: RegisteredType
    opening: number
    allowanceOverride: number | null
    craAllowance: number
    craNote: string | null
    contributed: number
    withdrawn: number
  }
  const rowsVM: RowVM[] = []
  for (const m of memberRows) {
    for (const type of TYPES) {
      const key = `${m.id}:${type}`
      const roomEntry = roomByMemberType.get(key)
      const limitEntry = limitByYearType.get(`${year}:${type}`)
      const accountIds = accountsByMemberType.get(key) ?? []
      let contributed = 0
      let withdrawn = 0
      for (const aid of accountIds) {
        const net = netByAccount.get(aid)
        if (!net) continue
        contributed += net.contributed
        withdrawn += net.withdrawn
      }
      rowsVM.push({
        member_id: m.id,
        memberName: m.display_name,
        type,
        opening: roomEntry?.opening ?? 0,
        allowanceOverride: roomEntry?.allowanceOverride ?? null,
        craAllowance: limitEntry?.amount ?? 0,
        craNote: limitEntry?.note ?? null,
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
        latest Notice of Assessment; for TFSA/FHSA, start with any unused room from prior years.
        Allowance defaults to the CRA annual limit in the database; use the override to paste a
        personalised figure (essential for RRSP, which depends on earned income).
        Contributions are summed from positive transactions against your registered accounts this
        year. Withdrawals are shown for reference but don&apos;t automatically restore room — TFSA
        withdrawals create new room for the following year, which you&apos;ll enter manually on
        the next year&apos;s page.
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
