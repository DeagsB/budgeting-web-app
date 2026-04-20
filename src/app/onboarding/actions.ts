'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export type OnboardingState = { error: string } | undefined

export async function createHousehold(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const householdName = String(formData.get('household_name') ?? '').trim()
  const memberName = String(formData.get('member_name') ?? '').trim()

  if (!householdName) return { error: 'Household name is required.' }
  if (!memberName) return { error: 'Your display name is required.' }
  if (householdName.length > 80) return { error: 'Household name is too long.' }
  if (memberName.length > 80) return { error: 'Display name is too long.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Atomic RPC: creates household, links caller as owner, adds first member,
  // seeds categories. Runs as security definer to avoid RLS chicken-and-egg
  // (user can't be household_member until the household exists).
  const { error } = await supabase.rpc('create_household_with_member', {
    household_name: householdName,
    member_name: memberName,
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
