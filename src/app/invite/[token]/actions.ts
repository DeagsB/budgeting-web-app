'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { acceptErrorMessage } from '@/lib/invitations'

export type AcceptState = { error: string } | undefined

export async function acceptInvitation(_prev: AcceptState, fd: FormData): Promise<AcceptState> {
  const token = String(fd.get('token') ?? '')
  if (!token) return { error: 'Missing invitation token.' }
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return { error: 'Sign in to accept the invitation.' }

  const { error } = await supabase.rpc('accept_household_invitation', { raw_token: token })
  if (error) return { error: acceptErrorMessage(error.message) }

  revalidatePath('/', 'layout')
  // Invited logins arrive without a password; let them set one before the app.
  const invited = userData.user.user_metadata?.invited === true && userData.user.user_metadata?.has_password !== true
  redirect(invited ? `/invite/${encodeURIComponent(token)}/password` : '/dashboard')
}

export type PasswordState = { error: string } | undefined

export async function setPassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const password = String(fd.get('password') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
