import { createClient } from '@/lib/supabase/server'
import { MapleLabel } from '@/components/ui/label'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'
import { InviteForm } from './invite-form'

export const dynamic = 'force-dynamic'

/**
 * Onboarding step 3 - who else is in the household. Optional: each invite
 * creates a member slot and emails a one-time link. Skippable; members can
 * always be added later from Setup.
 */
export default async function OnboardingInvitePage() {
  const { ctx } = await requireOnboardingStep('invite')
  const supabase = await createClient()

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from('members')
      .select('id, display_name, user_id')
      .eq('household_id', ctx!.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('household_invitations')
      .select('member_id, email')
      .eq('household_id', ctx!.householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  const emailByMember = new Map((invites ?? []).map((i) => [i.member_id as string, i.email as string]))
  const others = (members ?? []).filter((m) => m.user_id !== ctx!.userId)

  return (
    <OnboardingShell
      step="invite"
      title={
        <>
          Who shares
          <br />
          the money?
        </>
      }
      intro="Invite a partner, roommate or family member. Each gets their own login and sees only their accounts plus anything marked shared."
      eyebrow="Optional - you can invite people any time from Setup."
      footer={
        <StepFooter
          continueHref="/onboarding/budget"
          backHref="/onboarding/bank"
          backLabel="Back to accounts"
          skip={{ href: '/onboarding/budget' }}
        />
      }
      footnote="Invites are one-time links that expire in 7 days. Nobody sees your accounts until they accept."
    >
      <div className="flex flex-col gap-6">
        <div>
          <MapleLabel>Invite a member</MapleLabel>
          <div className="mt-3">
            <InviteForm />
          </div>
        </div>

        {others.length > 0 && (
          <div>
            <MapleLabel>Invited so far</MapleLabel>
            <ul className="mt-2 divide-y divide-hair rounded-[16px] border border-hair bg-cream-2 px-4">
              {others.map((m) => (
                <li key={m.id} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
                  <span className="truncate text-[14px] font-semibold text-ink">{m.display_name}</span>
                  <span className="shrink-0 text-[12px] text-ink-3">
                    {m.user_id ? 'Joined' : (emailByMember.get(m.id) ?? 'No invite sent')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </OnboardingShell>
  )
}
