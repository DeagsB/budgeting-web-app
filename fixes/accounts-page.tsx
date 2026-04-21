import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { formatMoney } from '@/lib/format'
import { accountTypeLabel } from '@/lib/domain'
import { MapleLabel } from '@/components/ui/label'
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
  const archivedCount = (accounts ?? []).filter((a) => a.archived_at).length

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Accounts
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
            Where the money lives.
          </h1>
          <Link
            href={showArchived ? '/accounts' : '/accounts?show=archived'}
            className="shrink-0 text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            {showArchived ? '← Active' : `Archived (${archivedCount}) →`}
          </Link>
        </div>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          Chequing, savings, registered, crypto, loans, credit cards, and cash — all in one ledger.
        </p>
      </header>

      {!showArchived && (
        <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
          <MapleLabel>Add account</MapleLabel>
          <AddAccountForm members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))} />
        </section>
      )}

      <section className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
        <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
          <MapleLabel>
            {showArchived ? 'Archived accounts' : `Active accounts (${visible.length})`}
          </MapleLabel>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            Opening total <span className="tabular-nums text-[var(--color-ink)]">{formatMoney(totalOpening)}</span>
          </span>
        </header>
        <ul>
          {visible.length === 0 && (
            <li className="px-5 py-10 text-center text-[13.5px] text-[var(--color-ink-2)]">
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
