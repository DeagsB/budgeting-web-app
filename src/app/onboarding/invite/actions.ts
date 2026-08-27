'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext, canManageHousehold } from '@/lib/household'
import { humanizeDbError } from '@/lib/errors'
import { createInvitation, type InviteState } from '@/app/(app)/setup/invite-actions'

/**
 * Onboarding step 3: create a member slot AND invite an email to claim it in
 * one go. Setup does the same in two moves (add member, then invite); here a
 * brand-new household has no spare slots yet, so both happen together. If
 * the invitation can't be created the slot is removed again so Setup never
 * shows a stray unlinked member.
 */
export async function inviteNewMember(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can invite people.' }

  const name = String(fd.get('member_name') ?? '').trim()
  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  if (!name) return { error: 'Give them a display name.' }
  if (name.length > 80) return { error: 'Display name is too long.' }
  if (!email.includes('@')) return { error: 'Enter a valid email address.' }

  const supabase = await createClient()
  const { data: member, error: insErr } = await supabase
    .from('members')
    .insert({ household_id: ctx.householdId, display_name: name })
    .select('id')
    .single()
  if (insErr || !member) return { error: humanizeDbError(insErr, { entity: 'display name' }) }

  const res = await createInvitation(ctx, { memberId: member.id as string, email, role: 'member' })
  if (!res || 'error' in res) {
    await supabase.from('members').delete().eq('id', member.id).eq('household_id', ctx.householdId)
    return res
  }

  revalidatePath('/onboarding/invite')
  return res
}
