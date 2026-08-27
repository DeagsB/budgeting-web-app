'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { inviteTokenFromNext, safeNextPath } from '@/lib/invitations'
import { acceptInviteToken } from '@/lib/accept-invite'

export type AuthState = { error: string } | undefined

function validate(formData: FormData): { email: string; password: string } | string {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !email.includes('@')) return 'Enter a valid email address.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  return { email, password }
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const v = validate(formData)
  if (typeof v === 'string') return { error: v }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(v)
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  const next = safeNextPath(String(formData.get('next') || ''))
  redirect(await landingFor(next))
}

/**
 * Where to send someone who has just authenticated. An invitation link is
 * accepted here rather than on the invite page: they clicked through from the
 * invitation and then proved who they are, so there is nothing left to ask.
 * A failure keeps them on the invite page, which explains what went wrong.
 */
async function landingFor(next: string): Promise<string> {
  const token = inviteTokenFromNext(next)
  if (!token) return next
  const accepted = await acceptInviteToken(token)
  return accepted.ok ? '/onboarding/welcome' : next
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const v = validate(formData)
  if (typeof v === 'string') return { error: v }

  // An invitation link carries ?next=/invite/<token>; keep it through the
  // confirmation email so the invitee lands back on the accept page.
  const next = safeNextPath(String(formData.get('next') || ''))
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const confirmUrl =
    next === '/dashboard' ? `${site}/auth/confirm` : `${site}/auth/confirm?next=${encodeURIComponent(next)}`

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: confirmUrl,
      data: { has_password: true },
    },
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  // Email-confirmation off → session is live immediately; skip the "check email"
  // page and, for an invitation, join the household right away.
  if (data.session) redirect(next === '/dashboard' ? '/onboarding' : await landingFor(next))
  redirect('/sign-up/check-email')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
