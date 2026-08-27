import { createClient } from '@/lib/supabase/server'
import { MapleLabel } from '@/components/ui/label'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'
import { MemberNameForm } from './form'

export const dynamic = 'force-dynamic'

/**
 * Member step 2 - the invitee names themselves. The owner invited an email
 * address and never picked a name for them, so the member row is called after
 * the email until this screen.
 */
export default async function MemberNamePage() {
  const { ctx } = await requireOnboardingStep('name')
  const supabase = await createClient()

  const { data: me } = await supabase
    .from('members')
    .select('display_name')
    .eq('id', ctx!.memberId!)
    .maybeSingle()

  return (
    <OnboardingShell
      step="name"
      title={
        <>
          What should
          <br />
          we call you?
        </>
      }
      intro="This is the name the rest of the household sees next to shared transactions and settle-ups. Your own first name is usually plenty."
      eyebrow="Only the people in this household see it"
      footer={
        <StepFooter
          backHref="/onboarding/welcome"
          skip="finish-member"
          skipLabel="Skip for now"
        />
      }
      footnote="You can change it any time from Setup."
    >
      <div>
        <MapleLabel>Display name</MapleLabel>
        <div className="mt-3">
          <MemberNameForm current={(me?.display_name as string | undefined) ?? ''} />
        </div>
      </div>
    </OnboardingShell>
  )
}
