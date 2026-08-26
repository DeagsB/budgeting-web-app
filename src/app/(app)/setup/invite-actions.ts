'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getHouseholdContext, canManageHousehold } from '@/lib/household'
import {
  confirmRedirectFor,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
} from '@/lib/invitations'

export type InviteState =
  | { ok: true; inviteUrl: string; emailSent: boolean; emailError?: string }
  | { error: string }
  | undefined

export type SimpleState = { ok: true } | { error: string } | undefined

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

/**
 * Owner/admin invites an email to take over an unlinked member. The row is
 * inserted through the RLS client (policy enforces role + member state); the
 * email goes out through Supabase Auth. Whatever happens with email, the raw
 * link is returned once so it can be shared by hand.
 */
export async function inviteMember(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can invite people.' }

  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  const memberId = String(fd.get('member_id') ?? '')
  const role = String(fd.get('role') ?? 'member') === 'admin' ? 'admin' : 'member'
  if (!email.includes('@')) return { error: 'Enter a valid email address.' }
  if (!memberId) return { error: 'Pick which member this person is.' }

  const supabase = await createClient()
  const { data: me } = await supabase.auth.getUser()
  if (me.user?.email && me.user.email.toLowerCase() === email) {
    return { error: 'That is your own email address.' }
  }

  const { data: member } = await supabase
    .from('members')
    .select('id, display_name, user_id, archived_at')
    .eq('id', memberId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!member) return { error: 'Member not found.' }
  if (member.user_id) return { error: 'That member already has a login.' }
  if (member.archived_at) return { error: 'Unarchive the member first.' }

  // Replace any live invite for this slot so "Resend" is just "invite again".
  await supabase
    .from('household_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('member_id', memberId)
    .is('accepted_at', null)
    .is('revoked_at', null)

  const raw = generateInviteToken()
  const { error: insErr } = await supabase.from('household_invitations').insert({
    household_id: ctx.householdId,
    member_id: memberId,
    email,
    role,
    token_hash: hashInviteToken(raw),
    invited_by: ctx.userId,
    expires_at: inviteExpiry().toISOString(),
  })
  if (insErr) return { error: insErr.message }

  const link = inviteUrl(siteUrl(), raw)
  const redirectTo = confirmRedirectFor(siteUrl(), raw)

  let emailSent = false
  let emailError: string | undefined
  const service = createServiceClient()
  if (service) {
    const { data: hh } = await supabase.from('households').select('name').eq('id', ctx.householdId).maybeSingle()
    const meta = {
      invited: true,
      household_name: hh?.name ?? 'your household',
      member_name: member.display_name as string,
    }
    const inv = await service.auth.admin.inviteUserByEmail(email, { redirectTo, data: meta })
    if (!inv.error) {
      emailSent = true
    } else if (/already|registered|exists/i.test(inv.error.message)) {
      // Existing account → magic link that lands on the same accept page.
      const otp = await service.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      })
      if (!otp.error) emailSent = true
      else emailError = otp.error.message
    } else {
      emailError = inv.error.message
    }
  } else {
    emailError = 'Email sending is not configured on this server.'
  }

  revalidatePath('/setup')
  return { ok: true, inviteUrl: link, emailSent, emailError }
}

export async function revokeInvitation(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can do that.' }
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: 'Missing invitation.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('household_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', ctx.householdId)
    .is('accepted_at', null)
  if (error) return { error: error.message }
  revalidatePath('/setup')
  return { ok: true }
}

/** Owner/admin removes another member's login; their data stays. */
export async function removeMemberLogin(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can do that.' }
  const memberId = String(fd.get('member_id') ?? '')
  if (!memberId) return { error: 'Missing member.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('unlink_member', { target_member_id: memberId })
  if (error) return { error: error.message.includes('cannot_unlink_self') ? 'You cannot remove your own login.' : error.message }
  revalidatePath('/setup')
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** A login with no member yet picks which member they are. */
export async function claimMember(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const memberId = String(fd.get('member_id') ?? '')
  if (!memberId) return { error: 'Pick a member.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('claim_member', { target_member_id: memberId })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}
