import { createClient } from '@/lib/supabase/server'

export type HouseholdContext = {
  userId: string
  householdId: string
}

/**
 * Returns the current user's household context, or null if they're unauthed
 * or haven't completed onboarding. Use this at the top of server components
 * and server actions that need household scoping.
 */
export async function getHouseholdContext(): Promise<HouseholdContext | null> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user

  if (!user) return null

  const { data: householdData } = await supabase
    .from('household_users')
    .select('household_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!householdData?.household_id) return null
  return { userId: user.id, householdId: householdData.household_id }
}
