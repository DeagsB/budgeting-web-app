import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { acceptErrorMessage } from '@/lib/invitations'

export type AcceptResult = { ok: true; householdId: string | null } | { ok: false; error: string }

/**
 * Join the household an invitation points at, as the signed-in user.
 *
 * Shared by every place a session can appear with an invitation in hand: the
 * sign-in and sign-up actions (`?next=/invite/<token>`), the email-confirm
 * route, and the invite page's own button for someone who arrives already
 * signed in. The RPC is the only thing that may stamp the invitation, and it
 * checks the token, the expiry and that the caller's email is the one that
 * was invited.
 */
export async function acceptInviteToken(token: string): Promise<AcceptResult> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { ok: false, error: acceptErrorMessage('not_authenticated') }

  const { data, error } = await supabase.rpc('accept_household_invitation', { raw_token: token })
  if (error) {
    // The mapped messages cover the invitation's own rules; anything else is a
    // fault worth seeing in the server log rather than only as "could not".
    console.error('[invite] accept failed:', error.message)
    return { ok: false, error: acceptErrorMessage(error.message) }
  }
  return { ok: true, householdId: (data as string | null) ?? null }
}
