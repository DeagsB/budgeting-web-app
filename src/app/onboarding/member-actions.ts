'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { humanizeDbError } from '@/lib/errors'

export type MemberNameState = { error: string } | undefined

/**
 * Member onboarding step 2. The invitee renames the member row that was
 * created for them when they accepted the invitation - the owner invited an
 * email address and never chose a name for them.
 */
export async function setMemberName(_prev: MemberNameState, fd: FormData): Promise<MemberNameState> {
  const name = String(fd.get('name') ?? '')
    .trim()
    .slice(0, 80)
  if (!name) return { error: 'Tell us what to call you.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!ctx.memberId) return { error: 'Your login is not attached to a member yet.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('members')
    .update({ display_name: name })
    .eq('id', ctx.memberId)
    .eq('household_id', ctx.householdId)
  if (error) return { error: humanizeDbError(error, { entity: 'name' }) }

  revalidatePath('/', 'layout')
  redirect('/onboarding/accounts')
}

/**
 * Ends the member track. Stamps members.onboarded_at so the (app) gate stops
 * sending this login back into onboarding, then drops them on the dashboard.
 */
export async function finishMemberOnboarding(): Promise<void> {
  const ctx = await getHouseholdContext()
  if (!ctx?.memberId) redirect('/dashboard')

  const supabase = await createClient()
  await supabase
    .from('members')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', ctx.memberId)
    .eq('household_id', ctx.householdId)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
