import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney } from '@/lib/format'
import { accountTypeLabel } from '@/lib/domain'
import { AddAccountForm } from './add-form'
import { AccountRow } from './row'

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const { show } = await searchParams
  const showArchived = show === 'archived'

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()

  const [{ data: accounts }, { data: members }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, ownership, member_id, opening_balance_cents, archived_at')
      .eq('household_id', ctx.householdId)
      .order('name'),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  const memberName = new Map((members ?? []).map((m) => [m.id, m.display_name]))
  const visible = (accounts ?? []).filter((a) => (showArchived ? a.archived_at : !a.archived_at))
  const totalOpening = visible.reduce((s, a) => s + Number(a.opening_balance_cents), 0)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Chequing, savings, registered, crypto, loans, credit cards, and cash.
          </p>
        </div>
        <Link
          href={showArchived ? '/accounts' : '/accounts?show=archived'}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          {showArchived ? '← Active accounts' : 'Show archived →'}
        </Link>
      </header>

      {!showArchived && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Add account</h2>
          <AddAccountForm members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))} />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-baseline justify-between border-b border-gray-200 px-6 py-3">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            {showArchived ? 'Archived accounts' : 'Active accounts'}
          </h2>
          <p className="text-xs text-gray-500">
            Opening total {formatMoney(totalOpening)}
          </p>
        </div>
        <ul>
          {visible.length === 0 && (
            <li className="px-6 py-6 text-sm text-gray-500">
              {showArchived ? 'Nothing archived.' : 'No accounts yet — add one above.'}
            </li>
          )}
          {visible.map((a) => (
            <AccountRow
              key={a.id}
              account={{
                id: a.id,
                name: a.name,
                type: a.type,
                typeLabel: accountTypeLabel(a.type),
                ownership: a.ownership,
                member_id: a.member_id,
                memberName: a.member_id ? (memberName.get(a.member_id) ?? null) : null,
                opening_balance_cents: Number(a.opening_balance_cents),
                archived: !!a.archived_at,
              }}
              members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
            />
          ))}
        </ul>
      </section>
    </div>
  )
}
