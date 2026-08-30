import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { perfTimer } from '@/lib/perf-timing'

export type HouseholdRole = 'owner' | 'admin' | 'member'

export type HouseholdContext = {
  userId: string
  householdId: string
  role: HouseholdRole
  /** The member row linked to this login, or null if not claimed yet. */
  memberId: string | null
}

/**
 * The verified signed-in user for this request, or null. `auth.getUser()` is
 * a network round trip to Supabase Auth; cached per request so the layout,
 * the page and every server action in one render share a single call.
 */
export const getSessionUser = cache(async () => {
  const lap = perfTimer('getSessionUser')
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  lap('getUser')
  return data?.user ?? null
})

/**
 * Returns the current user's household context, or null if they're unauthed
 * or haven't completed onboarding. Use this at the top of server components
 * and server actions that need household scoping. Cached per request so the
 * layout and page share one lookup.
 */
export const getHouseholdContext = cache(async (): Promise<HouseholdContext | null> => {
  const lap = perfTimer('getHouseholdContext')
  const user = await getSessionUser()
  if (!user) return null
  lap('user')
  const supabase = await createClient()

  const [{ data: hu }, { data: member }] = await Promise.all([
    supabase.from('household_users').select('household_id, role').eq('user_id', user.id).limit(1).maybeSingle(),
    supabase.from('members').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
  ])

  lap('queries')
  if (!hu?.household_id) return null
  const role = (hu.role as HouseholdRole) ?? 'member'
  return { userId: user.id, householdId: hu.household_id as string, role, memberId: (member?.id as string | null) ?? null }
})

export function canManageHousehold(ctx: Pick<HouseholdContext, 'role'>): boolean {
  return ctx.role === 'owner' || ctx.role === 'admin'
}
