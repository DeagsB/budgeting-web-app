import Link from 'next/link'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { SetupWizard } from './setup-wizard'

export const dynamic = 'force-dynamic'

export default async function AutoImportSetupPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const [{ data: household }, { data: accounts }, { data: members }, { data: categories }, { data: rules }, { data: log }] =
    await Promise.all([
      supabase
        .from('households')
        .select('id, email_ingest_secret')
        .eq('id', ctx.householdId)
        .single(),
      supabase
        .from('accounts')
        .select('id, name')
        .eq('household_id', ctx.householdId)
        .is('archived_at', null)
        .order('name'),
      supabase
        .from('members')
        .select('id, display_name')
        .eq('household_id', ctx.householdId)
        .is('archived_at', null)
        .order('sort_order'),
      supabase
        .from('categories')
        .select('id, name, code, parent_id')
        .eq('household_id', ctx.householdId)
        .is('archived_at', null)
        .order('sort_order'),
      supabase
        .from('bank_email_rules')
        .select(
          'id, name, enabled, match_from, match_subject, amount_regex, description_regex, date_regex, direction, inflow_regex, default_account_id, default_member_id, default_category_id',
        )
        .eq('household_id', ctx.householdId)
        .order('sort_order')
        .order('created_at'),
      supabase
        .from('email_ingestion_log')
        .select('id, received_at, from_address, subject, status, error_detail, transaction_id')
        .eq('household_id', ctx.householdId)
        .order('received_at', { ascending: false })
        .limit(15),
    ])

  // Build the absolute webhook URL the user pastes into Apps Script. Pulled
  // from the request headers so it works in dev (localhost) and prod alike.
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const webhookUrl = `${proto}://${host}/api/ingest/email`

  const hasSecret = !!household?.email_ingest_secret
  const hasAccounts = (accounts ?? []).length > 0
  const hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Auto-import
          </div>
          <Link
            href="/transactions/import"
            className="text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            ← Import
          </Link>
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Forward your bank&rsquo;s alerts. We do the rest.
        </h1>
        <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          Every Canadian bank can email you the second a card is swiped. We pair that
          with a tiny Gmail script you install once — alerts land here as transactions
          within seconds. No credentials shared, no monthly fees, you control every rule.
        </p>
      </header>

      {!hasAccounts && (
        <section className="rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper)] p-5 text-[13.5px] text-[var(--color-ink-2)] md:p-6">
          You need at least one account before auto-imported transactions have somewhere
          to land.{' '}
          <Link
            href="/accounts"
            className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            Add an account →
          </Link>
        </section>
      )}

      {!hasServiceRoleKey && (
        <section
          className="rounded-[20px] border p-5 md:p-6"
          style={{ borderColor: 'var(--color-honey)', background: 'var(--color-paper-2)' }}
        >
          <div
            className="text-[10.5px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--color-down)' }}
          >
            One more env var needed
          </div>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            The webhook needs <code className="rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 font-mono text-[12px]">SUPABASE_SERVICE_ROLE_KEY</code>{' '}
            to write incoming transactions on your behalf. Add it to{' '}
            <code className="rounded bg-[var(--color-cream-2)] px-1.5 py-0.5 font-mono text-[12px]">.env.local</code>{' '}
            (Supabase dashboard → Project Settings → API → <em>service_role</em> key) and restart
            the dev server. Until then the webhook will respond 503 and no alerts will land.
          </p>
        </section>
      )}

      <SetupWizard
        webhookUrl={webhookUrl}
        hasSecret={hasSecret}
        accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
        members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
        categories={(categories ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          parent_id: c.parent_id,
        }))}
        rules={(rules ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          match_from: r.match_from,
          match_subject: r.match_subject,
          amount_regex: r.amount_regex,
          description_regex: r.description_regex,
          date_regex: r.date_regex,
          direction: r.direction,
          inflow_regex: r.inflow_regex,
          default_account_id: r.default_account_id,
          default_member_id: r.default_member_id,
          default_category_id: r.default_category_id,
        }))}
        log={(log ?? []).map((l) => ({
          id: l.id,
          received_at: l.received_at,
          from_address: l.from_address,
          subject: l.subject,
          status: l.status,
          error_detail: l.error_detail,
          transaction_id: l.transaction_id,
        }))}
      />
    </div>
  )
}
