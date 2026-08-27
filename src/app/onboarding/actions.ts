'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { acceptErrorMessage } from '@/lib/invitations'
import { humanizeDbError } from '@/lib/errors'

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
  if (error) return { error: humanizeDbError(error, { entity: 'household name' }) }

  revalidatePath('/', 'layout')
  // Step 2: connect a bank (or add an account by hand). A dashboard with no
  // accounts is an empty screen, so we don't land there yet.
  redirect('/onboarding/bank')
}

/** Accept an invitation addressed to the signed-in email (no token needed). */
export async function acceptInvitationById(fd: FormData): Promise<{ ok: true } | { error: string }> {
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Missing invitation.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_invitation_by_id', { invitation_id: id })
  if (error) return { error: acceptErrorMessage(error.message) }
  revalidatePath('/', 'layout')
  return { ok: true }
}
