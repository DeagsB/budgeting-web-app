import { createClient } from '@/lib/supabase/server'
import { OnboardingShell } from './shell'
import { OnboardingForm } from './form'
import { PendingInvites, type PendingInvite } from './pending-invites'
import { requireOnboardingStep } from './guard'

export const dynamic = 'force-dynamic'

/** Onboarding step 1 - create the household (or accept a waiting invite). */
export default async function OnboardingPage() {
  await requireOnboardingStep('household')
  const supabase = await createClient()

  const { data: inviteRows } = await supabase.rpc('my_pending_invitations')
  const invites = ((inviteRows as PendingInvite[] | null) ?? []).map((i) => ({
    id: i.id,
    household_name: i.household_name,
    member_name: i.member_name,
  }))

  return (
    <OnboardingShell
      step="household"
      title={
        <>
          Welcome.
          <br />
          Let&rsquo;s set up
          <br />
          your household.
        </>
      }
      intro="A household groups everyone whose spending, accounts and goals you track together. You can add other members any time - each gets their own login."
      eyebrow="Takes about 30 seconds"
      footnote="Your data is encrypted at rest and only visible to members of your household."
    >
      <PendingInvites invites={invites} />
      <OnboardingForm />
    </OnboardingShell>
  )
}
