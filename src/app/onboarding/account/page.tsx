import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { MapleLabel } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { OnboardingShell } from '../shell'
import { FirstAccountForm } from './form'

export const dynamic = 'force-dynamic'

/**
 * Onboarding step 2 - the first account. Reached right after the household
 * is created; skipped entirely once the household holds any account, so a
 * stray bookmark can't reopen it.
 */
export default async function OnboardingAccountPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')

  const { count } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', ctx.householdId)
  if ((count ?? 0) > 0) redirect('/dashboard')

  return (
    <OnboardingShell
      step={2}
      title={
        <>
          Where does
          <br />
          your money live?
        </>
      }
      intro="Add one account to start - you can connect a bank or add more later."
      eyebrow="Last step"
      footnote="Balances stay private to your household. Nothing here is shared with anyone you haven't invited."
    >
      <div className="flex flex-col gap-6">
        <div>
          <MapleLabel>First account</MapleLabel>
          <div className="mt-4">
            <FirstAccountForm />
          </div>
        </div>

        <div className="rounded-[16px] border border-hair bg-cream-2 p-4">
          <MapleLabel>Connect a bank instead</MapleLabel>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Link your bank and accounts are created for you, with transactions syncing automatically.
          </p>
          <Link href="/transactions/import/plaid-setup" className="mt-3 inline-flex">
            <Button variant="secondary" size="md">
              Connect a bank
            </Button>
          </Link>
        </div>
      </div>
    </OnboardingShell>
  )
}
