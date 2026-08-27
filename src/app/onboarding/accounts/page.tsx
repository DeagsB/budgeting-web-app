import { createClient } from '@/lib/supabase/server'
import { PLAID_MAX_ITEMS } from '@/lib/plaid'
import { MapleLabel } from '@/components/ui/label'
import { PlaidConnect } from '@/components/plaid/plaid-connect'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'
import { FirstAccountForm } from '../bank/form'

export const dynamic = 'force-dynamic'

/**
 * Member step 3 - the invitee's own money. Same two ways in as the owner's
 * bank step (Plaid or by hand), but anything created here is private to this
 * member rather than shared with the household. Finishing stamps
 * members.onboarded_at and drops them on the dashboard.
 */
export default async function MemberAccountsPage() {
  const { ctx } = await requireOnboardingStep('accounts')
  const supabase = await createClient()

  const [{ data: items }, { data: accounts }] = await Promise.all([
    supabase
      .from('plaid_items')
      .select('id, institution_name')
      .eq('household_id', ctx!.householdId)
      .neq('status', 'removed'),
    supabase
      .from('accounts')
      .select('id, name, last_four, plaid_account_id, plaid_item_id')
      .eq('household_id', ctx!.householdId)
      .eq('member_id', ctx!.memberId!)
      .is('archived_at', null)
      .order('name'),
  ])

  const plaidConfigured =
    !!process.env.PLAID_CLIENT_ID &&
    !!process.env.PLAID_SECRET &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!process.env.PLAID_TOKEN_KEY
  const linkedCount = (items ?? []).length
  const mine = accounts ?? []

  return (
    <OnboardingShell
      step="accounts"
      title={
        <>
          Now bring in
          <br />
          your money.
        </>
      }
      intro="Connect your bank and Maple creates your accounts for you, with transactions syncing in automatically. Or add an account by hand and connect later."
      eyebrow="Read-only access through Plaid. Your bank login never touches Maple."
      footer={
        <StepFooter
          continueHref={undefined}
          backHref="/onboarding/name"
          skip="finish-member"
          skipLabel={mine.length > 0 ? 'Done, take me in' : 'Skip for now'}
        />
      }
      footnote="Accounts you add here are private to you. Mark one shared later if the whole household should see it."
    >
      <div className="flex flex-col gap-6">
        <div>
          <MapleLabel>Connect a bank</MapleLabel>
          <div className="mt-3">
            {plaidConfigured ? (
              <PlaidConnect
                plaidConfigured={plaidConfigured}
                atCap={linkedCount >= PLAID_MAX_ITEMS}
                maxItems={PLAID_MAX_ITEMS}
                linkedCount={linkedCount}
                accounts={mine.map((a) => ({
                  id: a.id,
                  name: a.name,
                  last_four: a.last_four ?? null,
                  plaid_account_id: a.plaid_account_id ?? null,
                  plaid_item_id: a.plaid_item_id ?? null,
                }))}
                canOwn={ctx!.memberId !== null}
                variant="plain"
                returnTo="/onboarding/accounts"
                connectLabel={linkedCount > 0 ? 'Connect another bank' : 'Connect a bank'}
              />
            ) : (
              <p className="rounded-[12px] bg-cream-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                Bank sync isn’t configured on this server yet. Add an account by hand below - you can
                connect a bank from Accounts once it’s set up.
              </p>
            )}
          </div>
        </div>

        {mine.length > 0 && (
          <div
            aria-live="polite"
            className="rounded-[16px] border border-hair bg-cream-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2"
          >
            {mine.length === 1 ? '1 account' : `${mine.length} accounts`} so far:{' '}
            <span className="font-semibold text-ink">{mine.map((a) => a.name).join(', ')}</span>. Add
            another, or head in.
          </div>
        )}

        <div className="relative">
          <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-hair" />
          <div className="relative mx-auto w-max bg-paper px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            or add an account by hand
          </div>
        </div>

        <FirstAccountForm />
      </div>
    </OnboardingShell>
  )
}
