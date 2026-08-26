import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { OnboardingShell } from './shell'
import { OnboardingForm } from './form'
import { PendingInvites, type PendingInvite } from './pending-invites'

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (ctx) redirect('/dashboard')

  const { data: inviteRows } = await supabase.rpc('my_pending_invitations')
  const invites = ((inviteRows as PendingInvite[] | null) ?? []).map((i) => ({
    id: i.id,
    household_name: i.household_name,
    member_name: i.member_name,
  }))

  return (
    <OnboardingShell
      step={1}
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
