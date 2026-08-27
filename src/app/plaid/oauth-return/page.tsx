import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PLAID_MAX_ITEMS } from '@/lib/plaid'
import { OAuthReturn } from './oauth-return'

export const dynamic = 'force-dynamic'

/**
 * The single Plaid OAuth redirect URI (PLAID_REDIRECT_URI must point here and
 * match the Plaid dashboard). Lives outside the (app) shell and outside
 * /onboarding so neither redirect gate can interrupt a bank hand-off.
 */
export default async function PlaidOAuthReturnPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/sign-in?next=/plaid/oauth-return')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase.from('plaid_items').select('id').eq('household_id', ctx.householdId).neq('status', 'removed'),
    supabase
      .from('accounts')
      .select('id, name, last_four, plaid_account_id, plaid_item_id')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
  ])

  const plaidConfigured =
    !!process.env.PLAID_CLIENT_ID &&
    !!process.env.PLAID_SECRET &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!process.env.PLAID_TOKEN_KEY
  const linkedCount = (items ?? []).length

  return (
    <main className="min-h-dvh bg-cream px-6 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+24px)] text-ink">
      <div className="mx-auto max-w-[560px]">
        <div className="font-serif text-[32px] leading-none tracking-[-0.02em]">Maple</div>
        <h1 className="mt-6 font-serif text-[28px] leading-[1.05] tracking-[-0.02em]">Back from your bank</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          Finishing the secure connection through Plaid.
        </p>
        <div className="mt-6 rounded-[24px] border border-hair bg-paper p-6 shadow-[var(--shadow-float)]">
          <OAuthReturn
            plaidConfigured={plaidConfigured}
            atCap={linkedCount >= PLAID_MAX_ITEMS}
            maxItems={PLAID_MAX_ITEMS}
            linkedCount={linkedCount}
            accounts={(accounts ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              last_four: a.last_four ?? null,
              plaid_account_id: a.plaid_account_id ?? null,
              plaid_item_id: a.plaid_item_id ?? null,
            }))}
            canOwn={ctx.memberId !== null}
          />
        </div>
      </div>
    </main>
  )
}
