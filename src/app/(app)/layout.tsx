import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext, getSessionUser } from '@/lib/household'
import { perfTimer } from '@/lib/perf-timing'
import { nextOnboardingStep, onboardingPath } from '@/lib/onboarding'
import { AppShell } from './shell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const lap = perfTimer('layout')
  // One auth round trip per request: getHouseholdContext() (also called by
  // every page) reuses this cached user instead of asking Supabase again.
  const user = await getSessionUser()
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')
  lap('ctx')

  const supabase = await createClient()

  const [{ data: household }, { data: me }, { count: accountCount }] = await Promise.all([
    supabase.from('households').select('name, onboarding_completed_at').eq('id', ctx.householdId).single(),
    ctx.memberId
      ? supabase.from('members').select('display_name, onboarded_at').eq('id', ctx.memberId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('household_id', ctx.householdId),
  ])

  // The creating owner walks the guided flow until they finish or skip it;
  // someone who joined by invitation walks their own three steps first.
  const step = nextOnboardingStep({
    hasHousehold: true,
    role: ctx.role,
    accountCount: accountCount ?? 0,
    completedAt: (household?.onboarding_completed_at as string | null) ?? null,
    memberOnboardedAt: (me?.onboarded_at as string | null) ?? null,
    hasMember: ctx.memberId !== null,
  })
  lap('queries')
  if (step !== 'done') redirect(onboardingPath(step))

  return (
    <AppShell
      householdName={household?.name ?? 'Household'}
      userEmail={user.email ?? ''}
      memberName={(me?.display_name as string | null) ?? null}
    >
      {children}
    </AppShell>
  )
}
