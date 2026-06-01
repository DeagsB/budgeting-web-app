import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { Amount } from '@/components/ui/amount'
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
      .select('id, name, type, ownership, member_id, opening_balance_cents, last_four, archived_at')
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
  const archivedCount = (accounts ?? []).filter((a) => a.archived_at).length

  // Headline split: assets sum opening balances of non-liability accounts;
  // owing sums opening balances of liability accounts (loan / credit_card).
  // Summing everything together would let a loan inflate the asset total.
  let assetsCents = 0
  let owingCents = 0
  for (const a of visible) {
    const cents = Number(a.opening_balance_cents)
    if (LIABILITY_TYPES.has(a.type as AccountType)) owingCents += cents
    else assetsCents += cents
  }
  const netCents = assetsCents - owingCents

  const memberList = (members ?? []).map((m) => ({ id: m.id, name: m.display_name }))

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Accounts"
        title="Where the money lives."
        subtitle="Chequing, savings, registered, crypto, loans, credit cards, and cash — all in one ledger."
        actions={
          <Link
            href={showArchived ? '/accounts' : '/accounts?show=archived'}
            className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
          >
            {showArchived ? '← Active' : `Archived (${archivedCount}) →`}
          </Link>
        }
      />

      {!showArchived && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="Assets"
            value={<Amount cents={assetsCents} />}
            tone="leaf"
            hint="Opening balances across non-liability accounts"
          />
          <StatTile
            label="Owing"
            value={<Amount cents={owingCents} />}
            tone="maple"
            hint="Loans & credit cards"
          />
          <StatTile
            label="Net opening"
            value={<Amount cents={netCents} sign="auto" />}
            tone={netCents >= 0 ? 'leaf' : 'maple'}
            hint="Assets minus owing"
          />
        </section>
      )}

      {!showArchived && (
        <Card>
          <MapleLabel>Add account</MapleLabel>
          <AddAccountForm members={memberList} />
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
          <MapleLabel>
            {showArchived ? 'Archived accounts' : `Active accounts (${visible.length})`}
          </MapleLabel>
        </header>
        {visible.length === 0 ? (
          <div className="px-5 py-8">
            {showArchived ? (
              <EmptyState
                title="Nothing archived"
                body="Accounts you archive will show up here. They stay out of your active ledger but keep their history."
              />
            ) : (
              <EmptyState
                title="No accounts yet"
                body="Add your first account above — chequing, savings, a registered plan, or a loan — to start tracking where your money lives."
              />
            )}
          </div>
        ) : (
          <ul>
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
                  last_four: a.last_four ?? null,
                  archived: !!a.archived_at,
                }}
                members={memberList}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
