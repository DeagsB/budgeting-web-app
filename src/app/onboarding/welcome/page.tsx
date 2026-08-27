import { createClient } from '@/lib/supabase/server'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'

export const dynamic = 'force-dynamic'

/**
 * Member step 1 - what you just joined. The household already exists, so this
 * is the one screen that explains what the other people in it can and cannot
 * see before the invitee puts any of their own money in.
 */
export default async function MemberWelcomePage() {
  const { ctx } = await requireOnboardingStep('welcome')
  const supabase = await createClient()

  const [{ data: household }, { data: invite }] = await Promise.all([
    supabase.from('households').select('name').eq('id', ctx!.householdId).maybeSingle(),
    supabase
      .from('household_invitations')
      .select('invited_by, accepted_at')
      .eq('household_id', ctx!.householdId)
      .eq('accepted_by', ctx!.userId)
      .not('accepted_at', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const { data: inviter } = invite?.invited_by
    ? await supabase
        .from('members')
        .select('display_name')
        .eq('household_id', ctx!.householdId)
        .eq('user_id', invite.invited_by)
        .maybeSingle()
    : { data: null }

  const householdName = (household?.name as string | undefined) ?? 'the household'
  const inviterName = (inviter?.display_name as string | null | undefined) ?? null

  return (
    <OnboardingShell
      step="welcome"
      title={
        <>
          You are in.
          <br />
          Here is the deal.
        </>
      }
      intro={
        inviterName
          ? `${inviterName} invited you to ${householdName}. Two more short steps and it is yours to use.`
          : `You have joined ${householdName}. Two more short steps and it is yours to use.`
      }
      eyebrow="Takes about a minute"
      footer={
        <StepFooter continueHref="/onboarding/name" skip="finish-member" skipLabel="Skip for now" />
      }
      footnote="You can change any of this later from Setup."
    >
      <div className="flex flex-col gap-4">
        <Rule
          tone="private"
          title="Your accounts stay yours"
          body="Accounts you add are private to your login. Nobody else in the household sees their balances or transactions."
        />
        <Rule
          tone="shared"
          title="Joint accounts are shared"
          body="Anything marked shared shows up for everyone, so the household can budget and settle up together."
        />
        <Rule
          tone="shared"
          title="You choose what to split"
          body="A transaction is only visible to someone else once you share it with them."
        />
      </div>
    </OnboardingShell>
  )
}

function Rule({ tone, title, body }: { tone: 'private' | 'shared'; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-[16px] border border-hair bg-cream-2 px-4 py-3">
      <span
        aria-hidden
        className={
          'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (tone === 'private' ? 'bg-leaf' : 'bg-honey')
        }
      />
      <div>
        <div className="text-[14px] font-semibold text-ink">{title}</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{body}</p>
      </div>
    </div>
  )
}
