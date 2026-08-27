'use server'

import { revalidatePath } from 'next/cache'
import { getHouseholdContext, canManageHousehold } from '@/lib/household'
import { createInvitation, type InviteState } from '@/app/(app)/setup/invite-actions'

/**
 * Onboarding step 3: invite an email address. Nothing is created for the
 * invitee here - the member row appears when they accept, and they name it
 * themselves in their own onboarding.
 */
export async function inviteNewMember(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can invite people.' }

  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  if (!email.includes('@')) return { error: 'Enter a valid email address.' }

  const res = await createInvitation(ctx, { email, role: 'member' })
  revalidatePath('/onboarding/invite')
  return res
}
