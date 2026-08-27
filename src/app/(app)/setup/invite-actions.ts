'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext, canManageHousehold, type HouseholdContext } from '@/lib/household'
import { generateInviteToken, hashInviteToken, inviteExpiry, inviteUrl } from '@/lib/invitations'
import { humanizeDbError } from '@/lib/errors'
import { sendEmail } from '@/lib/email/send'
import { householdInviteEmail } from '@/lib/email/templates'

export type InviteState =
  | { ok: true; inviteUrl: string; emailSent: boolean; emailError?: string }
  | { error: string }
  | undefined

export type SimpleState = { ok: true } | { error: string } | undefined

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
}

/**
 * Owner/admin invites an email address. Nothing is created for the invitee
 * here: the member row appears when they accept, and they name it themselves
 * during their own onboarding. Whatever happens with email, the raw link is
 * returned once so it can be shared by hand.
 */
export async function inviteMember(_prev: InviteState, fd: FormData): Promise<InviteState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  if (!canManageHousehold(ctx)) return { error: 'Only the household owner can invite people.' }

  const email = String(fd.get('email') ?? '')
    .trim()
    .toLowerCase()
  const role = String(fd.get('role') ?? 'member') === 'admin' ? 'admin' : 'member'
  if (!email.includes('@')) return { error: 'Enter a valid email address.' }

  return createInvitation(ctx, { email, role })
}

/**
 * Core of inviteMember, shared with onboarding step 3. Caller has already
 * authorised `ctx` and normalised the inputs.
 */
export async function createInvitation(
  ctx: HouseholdContext,
  { email, role }: { email: string; role: 'member' | 'admin' },
): Promise<InviteState> {
  const supabase = await createClient()
  const { data: me } = await supabase.auth.getUser()
  if (me.user?.email && me.user.email.toLowerCase() === email) {
    return { error: 'That is your own email address.' }
  }

  // Replace any live invite for this address so "Resend" is just "invite again".
  await supabase
    .from('household_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('household_id', ctx.householdId)
    .eq('email', email)
    .is('accepted_at', null)
    .is('revoked_at', null)

  const raw = generateInviteToken()
  const { error: insErr } = await supabase.from('household_invitations').insert({
    household_id: ctx.householdId,
    email,
    role,
    token_hash: hashInviteToken(raw),
    invited_by: ctx.userId,
    expires_at: inviteExpiry().toISOString(),
  })
  if (insErr) return { error: insErr.message }

  const link = inviteUrl(siteUrl(), raw)

  // The invite email is ours (Resend), not Supabase Auth's: the /invite/<token>
  // landing handles both "create an account" and "I already have one", so no
  // auth user needs to exist up front. Delivery is best-effort; the link is
  // always returned so it can be shared by hand.
  const [{ data: hh }, { data: me_ }] = await Promise.all([
    supabase.from('households').select('name').eq('id', ctx.householdId).maybeSingle(),
    ctx.memberId
      ? supabase.from('members').select('display_name').eq('id', ctx.memberId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const mail = householdInviteEmail({
    householdName: (hh?.name as string | undefined) ?? 'your household',
    inviterName: ((me_?.display_name as string | null | undefined) ?? null) || null,
    inviteUrl: link,
  })
  const sent = await sendEmail({ to: email, ...mail, replyTo: me.user?.email ?? undefined })

  revalidatePath('/setup')
  return sent.ok
    ? { ok: true, inviteUrl: link, emailSent: true }
    : { ok: true, inviteUrl: link, emailSent: false, emailError: sent.error }
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
  if (error) return { error: humanizeDbError(error) }
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
  if (error) return { error: error.message.includes('cannot_unlink_self') ? 'You cannot remove your own login.' : humanizeDbError(error) }
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
  if (error) return { error: humanizeDbError(error) }
  revalidatePath('/', 'layout')
  return { ok: true }
}
