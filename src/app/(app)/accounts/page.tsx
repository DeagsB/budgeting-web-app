import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { accountTypeLabel, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { monthStartISO } from '@/lib/format'
import { accountBalanceAt, groupSnapsByAccount, groupTxByAccount } from '@/lib/balances'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { StatTile } from '@/components/ui/stat-tile'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ResponsiveAmount } from '@/components/ui/responsive-amount'
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

  // Same query shape as balance-sheet/page.tsx so the headline here derives
  // the SAME current balances (opening/snapshot anchor + transactions) that
  // the dashboard, balance sheet and net-worth views show - not the opening
  // balances, which drift from reality the moment a transaction lands.
  const [{ data: accounts }, { data: snapshots }, { data: txData }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, ownership, opening_balance_cents, last_four, archived_at')
      .eq('household_id', ctx.householdId)
      .order('name'),
    supabase
      .from('account_balance_snapshots')
      .select('account_id, balance_cents, as_of_month')
      .eq('household_id', ctx.householdId)
      .order('as_of_month', { ascending: false }),
    supabase
      .from('transactions')
      .select('account_id, occurred_on, amount_cents')
      .eq('household_id', ctx.householdId)
      .limit(20000),
  ])

  const visible = (accounts ?? []).filter((a) => (showArchived ? a.archived_at : !a.archived_at))
  const archivedCount = (accounts ?? []).filter((a) => a.archived_at).length

  const txByAccount = groupTxByAccount(
    (txData ?? []).map((t) => ({
      account_id: t.account_id as string,
      occurred_on: t.occurred_on as string,
      amount_cents: Number(t.amount_cents),
    })),
  )
  const snapsByAccount = groupSnapsByAccount(
    (snapshots ?? []).map((s) => ({
      account_id: s.account_id as string,
      as_of_month: s.as_of_month as string,
      balance_cents: Number(s.balance_cents),
    })),
  )
  const thisMonth = monthStartISO()

  // Headline split: "you have" sums current balances of non-liability
  // accounts; "you owe" sums current balances of liabilities (loan /
  // credit_card). Summing everything together would let a loan inflate assets.
  let assetsCents = 0
  let owingCents = 0
  for (const a of visible) {
    const cents = accountBalanceAt(
      { id: a.id, type: a.type as AccountType, opening_balance_cents: Number(a.opening_balance_cents) },
      thisMonth,
      txByAccount,
      snapsByAccount,
    )
    if (LIABILITY_TYPES.has(a.type as AccountType)) owingCents += cents
    else assetsCents += cents
  }
  const netCents = assetsCents - owingCents

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Accounts"
        title="Where the money lives."
        subtitle="Chequing, savings, registered, crypto, loans, credit cards, and cash - all in one ledger."
        actions={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link href="/transactions/import/plaid-setup" className="inline-flex">
              <Button type="button" variant="secondary" size="sm">
                <BankIcon />
                Connect a bank
              </Button>
            </Link>
            <Link
              href={showArchived ? '/accounts' : '/accounts?show=archived'}
              className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              {showArchived ? '← Active' : `Archived (${archivedCount}) →`}
            </Link>
          </div>
        }
      />

      {/* One compact three-up row so the ledger stays above the fold on a
          375px screen. Mobile abbreviates the value; sm+ shows cents. */}
      {!showArchived && (
        <section className="grid grid-cols-3 gap-2 sm:gap-3">
          <StatTile
            compact
            className="sm:p-4"
            label="You have"
            value={<ResponsiveAmount cents={assetsCents} />}
            tone="leaf"
            hint="Cash + investments"
          />
          <StatTile
            compact
            className="sm:p-4"
            label="You owe"
            value={<ResponsiveAmount cents={owingCents} />}
            tone="maple"
            hint="Loans + cards"
          />
          <StatTile
            compact
            className="sm:p-4"
            label="Net worth"
            value={<ResponsiveAmount cents={netCents} sign="auto" />}
            tone={netCents >= 0 ? 'leaf' : 'maple'}
            hint="Have minus owe"
          />
        </section>
      )}

      {!showArchived && (
        <Card>
          <MapleLabel>Add account</MapleLabel>
          <AddAccountForm canOwn={ctx.memberId !== null} />
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
                body="Connect your bank and Maple creates the accounts for you, with transactions syncing in automatically. Or add one by hand above."
                action={
                  <Link href="/transactions/import/plaid-setup" className="inline-flex">
                    <Button type="button" variant="primary" size="md">
                      <BankIcon />
                      Connect a bank
                    </Button>
                  </Link>
                }
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
                  opening_balance_cents: Number(a.opening_balance_cents),
                  last_four: a.last_four ?? null,
                  archived: !!a.archived_at,
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function BankIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 5H3l9-5z" />
    </svg>
  )
}
