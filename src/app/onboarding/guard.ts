import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext, type HouseholdContext } from '@/lib/household'
import {
  canVisitStep,
  nextOnboardingStep,
  onboardingPath,
  type OnboardingState,
  type OnboardingStep,
} from '@/lib/onboarding'

/**
 * Server-only onboarding state loader. One lookup per request (React cache)
 * shared by every step page and the (app) layout gate.
 */
export const loadOnboardingState = cache(
  async (): Promise<{ user: User | null; ctx: HouseholdContext | null; state: OnboardingState }> => {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const user = data?.user ?? null
    if (!user) {
      return { user: null, ctx: null, state: { hasHousehold: false, role: null, accountCount: 0, completedAt: null } }
    }

    const ctx = await getHouseholdContext()
    if (!ctx) {
      return { user, ctx: null, state: { hasHousehold: false, role: null, accountCount: 0, completedAt: null } }
    }

    const [{ data: household }, { count }] = await Promise.all([
      supabase.from('households').select('onboarding_completed_at').eq('id', ctx.householdId).maybeSingle(),
      supabase.from('accounts').select('id', { count: 'exact', head: true }).eq('household_id', ctx.householdId),
    ])

    return {
      user,
      ctx,
      state: {
        hasHousehold: true,
        role: ctx.role,
        accountCount: count ?? 0,
        completedAt: (household?.onboarding_completed_at as string | null) ?? null,
      },
    }
  },
)

/**
 * Call at the top of each step page. Redirects to sign-in when unauthenticated
 * and to the correct step when this one isn't visitable (e.g. a stale
 * bookmark, or the flow is already complete).
 */
export async function requireOnboardingStep(step: OnboardingStep) {
  const loaded = await loadOnboardingState()
  if (!loaded.user) redirect('/sign-in')
  if (!canVisitStep(loaded.state, step)) redirect(onboardingPath(nextOnboardingStep(loaded.state)))
  return loaded
}
