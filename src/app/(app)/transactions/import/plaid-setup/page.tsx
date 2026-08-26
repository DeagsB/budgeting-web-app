import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PlaidWizard } from './plaid-wizard'

export const dynamic = 'force-dynamic'

const MAX_ITEMS = 10

export default async function PlaidSetupPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const [{ data: items }, { data: accounts }, { data: log }] = await Promise.all([
    supabase
      .from('plaid_items')
      .select('id, institution_name, status, last_synced_at, error_detail, needs_account_review, created_at')
      .eq('household_id', ctx.householdId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true }),
    supabase
      .from('accounts')
      .select('id, name, last_four, plaid_account_id, plaid_item_id')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('plaid_sync_log')
      .select('id, ran_at, added, modified, removed, reconciled, status, error_detail')
      .eq('household_id', ctx.householdId)
      .order('ran_at', { ascending: false })
      .limit(10),
  ])

  const plaidConfigured = !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const hasTokenKey = !!process.env.PLAID_TOKEN_KEY

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Connect a bank
          </div>
          <Link
            href="/transactions/import"
            className="text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:underline"
          >
            ← Import
          </Link>
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-ink md:text-[40px]">
          Link your bank. Get real merchant names.
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
          Plaid pulls your transactions automatically - with the actual merchant, not a
          &ldquo;withdrawal warning.&rdquo; The free tier covers up to {MAX_ITEMS} banks. Anything that
          matches an existing email-alert row just gets its name upgraded, so the two never double up.
        </p>
      </header>

      {!plaidConfigured && (
        <section className="rounded-lg border border-honey bg-paper-2 p-5 md:p-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-down">
            Plaid isn’t configured yet
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            Add <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">PLAID_CLIENT_ID</code>,{' '}
            <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">PLAID_SECRET</code>,{' '}
            <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">PLAID_ENV</code> and{' '}
            <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">PLAID_TOKEN_KEY</code> to{' '}
            <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">.env.local</code> and restart.
            Sign up free at{' '}
            <a href="https://dashboard.plaid.com" target="_blank" rel="noreferrer" className="font-semibold text-ink underline-offset-2 hover:underline">
              dashboard.plaid.com
            </a>{' '}
            - use Sandbox keys to try it, then Production keys for the free Trial tier.
          </p>
        </section>
      )}

      {plaidConfigured && (!hasServiceRoleKey || !hasTokenKey) && (
        <section className="rounded-lg border border-honey bg-paper-2 p-5 md:p-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-down">
            One more env var needed
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            {!hasServiceRoleKey && (
              <>
                <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
                lets the sync write transactions.{' '}
              </>
            )}
            {!hasTokenKey && (
              <>
                <code className="rounded bg-cream-2 px-1.5 py-0.5 font-mono text-[12px]">PLAID_TOKEN_KEY</code>{' '}
                (32 random bytes, base64) encrypts the access token at rest.
              </>
            )}
          </p>
        </section>
      )}

      <PlaidWizard
        plaidConfigured={plaidConfigured}
        maxItems={MAX_ITEMS}
        items={(items ?? []).map((it) => ({
          id: it.id,
          institutionName: it.institution_name ?? 'Bank',
          status: it.status,
          lastSyncedAt: it.last_synced_at,
          errorDetail: it.error_detail,
          needsAccountReview: it.needs_account_review === true,
        }))}
        accounts={(accounts ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          last_four: a.last_four ?? null,
          plaid_account_id: a.plaid_account_id ?? null,
          plaid_item_id: a.plaid_item_id ?? null,
        }))}
        canOwn={ctx.memberId !== null}
        log={(log ?? []).map((l) => ({
          id: l.id,
          ran_at: l.ran_at,
          added: l.added,
          modified: l.modified,
          removed: l.removed,
          reconciled: l.reconciled,
          status: l.status,
          error_detail: l.error_detail,
        }))}
      />
    </div>
  )
}
