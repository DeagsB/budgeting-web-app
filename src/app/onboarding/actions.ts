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

  // Create household. RLS: allowed because auth.uid() is set.
  const { data: household, error: hhError } = await supabase
    .from('households')
    .insert({ name: householdName })
    .select('id')
    .single()

  if (hhError || !household) {
    return { error: hhError?.message ?? 'Failed to create household.' }
  }

  // Link the user. Without this, subsequent RLS checks for the household fail.
  const { error: linkError } = await supabase.from('household_users').insert({
    household_id: household.id,
    user_id: user.id,
    role: 'owner',
  })
  if (linkError) return { error: linkError.message }

  // First member (the signed-in user). More can be added later.
  const { error: memberError } = await supabase.from('members').insert({
    household_id: household.id,
    display_name: memberName,
    sort_order: 0,
  })
  if (memberError) return { error: memberError.message }

  // Seed the default category tree.
  const { error: seedError } = await supabase.rpc('seed_default_categories', {
    h_id: household.id,
  })
  if (seedError) return { error: seedError.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
