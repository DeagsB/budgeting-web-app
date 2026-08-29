import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PLAID_MAX_ITEMS } from '@/lib/plaid'
import { PlaidWizard } from './plaid-wizard'

export const dynamic = 'force-dynamic'

const MAX_ITEMS = PLAID_MAX_ITEMS

export default async function PlaidSetupPage({
  searchParams,
}: {
  /** `?reauth=<itemRowId>` from plaidReconnectHref - auto-opens update-mode Link for that bank. */
  searchParams: Promise<{ reauth?: string }>
}) {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const { reauth } = await searchParams

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

      {/*
       * Full env-var checklist for whoever runs this server (never shown to
       * end users - they can't do anything about a missing env var):
       *   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV  - from dashboard.plaid.com
       *     (Sandbox keys to try it, Production keys for the free Trial tier)
       *   PLAID_TOKEN_KEY                           - 32 random bytes, base64;
       *     encrypts the stored access token at rest
       *   SUPABASE_SERVICE_ROLE_KEY                 - lets the sync write
       *     transactions with the service-role client
       * Set them in .env.local (or the host's env config) and restart.
       */}
      {(!plaidConfigured || !hasServiceRoleKey || !hasTokenKey) && (
        <section className="rounded-lg border border-honey bg-paper-2 p-5 md:p-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-down">
            Bank sync isn’t set up yet
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            Bank sync isn’t set up on this server yet. Ask whoever runs it to finish the Plaid setup.
          </p>
        </section>
      )}

      <PlaidWizard
        plaidConfigured={plaidConfigured}
        maxItems={MAX_ITEMS}
        reauthItemId={reauth}
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
