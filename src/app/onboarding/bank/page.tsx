import { createClient } from '@/lib/supabase/server'
import { PLAID_MAX_ITEMS } from '@/lib/plaid'
import { MapleLabel } from '@/components/ui/label'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'
import { BankConnect } from './bank-connect'
import { FirstAccountForm } from './form'

export const dynamic = 'force-dynamic'

/**
 * Onboarding step 2 - where the money lives. Connect a bank through Plaid
 * (accounts are created from the mapping, transactions sync in) or add one
 * account by hand. Revisitable until the flow is finished, so a second bank
 * can be added; "Skip for now" ends the guided flow.
 */
export default async function OnboardingBankPage() {
  const { ctx, state } = await requireOnboardingStep('bank')
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
      .is('archived_at', null)
      .order('name'),
  ])

  const plaidConfigured =
    !!process.env.PLAID_CLIENT_ID &&
    !!process.env.PLAID_SECRET &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !!process.env.PLAID_TOKEN_KEY
  const linkedCount = (items ?? []).length
  const hasAccounts = state.accountCount > 0

  return (
    <OnboardingShell
      step="bank"
      title={
        <>
          Where does
          <br />
          your money live?
        </>
      }
      intro="Connect your bank and Maple creates the accounts for you, with transactions syncing in automatically. Or add an account by hand and connect later."
      eyebrow="Read-only access through Plaid. Your bank login never touches Maple."
      footer={
        <StepFooter
          continueHref={hasAccounts ? '/onboarding/invite' : undefined}
          skip="finish"
        />
      }
      footnote="Balances stay private to your household. Nothing here is shared with anyone you haven't invited."
    >
      <div className="flex flex-col gap-6">
        <div>
          <MapleLabel>Connect a bank</MapleLabel>
          <div className="mt-3">
            {plaidConfigured ? (
              <BankConnect
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
                canOwn={ctx!.memberId !== null}
              />
            ) : (
              <p className="rounded-[12px] bg-cream-2 px-3 py-2 text-[13px] leading-relaxed text-ink-2">
                Bank sync isn’t configured on this server yet. Add an account by hand below - you can
                connect a bank from Accounts once it’s set up.
              </p>
            )}
          </div>
        </div>

        {hasAccounts && (
          <div className="rounded-[16px] border border-hair bg-cream-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
            {state.accountCount === 1 ? '1 account' : `${state.accountCount} accounts`} so far:{' '}
            <span className="font-semibold text-ink">
              {(accounts ?? []).map((a) => a.name).join(', ')}
            </span>
            . Connect another bank, add one by hand, or continue.
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
