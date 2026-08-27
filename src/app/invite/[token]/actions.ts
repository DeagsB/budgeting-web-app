'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { acceptInviteToken } from '@/lib/accept-invite'

export type AcceptState = { error: string } | undefined

/**
 * Accept from the invite card. Only reached by someone who was already signed
 * in when they opened the link - signing in or signing up from the card joins
 * them on the way through. Lands on the member's own onboarding.
 */
export async function acceptInvitation(_prev: AcceptState, fd: FormData): Promise<AcceptState> {
  const token = String(fd.get('token') ?? '')
  if (!token) return { error: 'Missing invitation token.' }

  const accepted = await acceptInviteToken(token)
  if (!accepted.ok) return { error: accepted.error }

  revalidatePath('/', 'layout')
  redirect('/onboarding/welcome')
}
