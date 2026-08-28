'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { inviteTokenFromNext, safeNextPath } from '@/lib/invitations'
import { acceptInviteToken } from '@/lib/accept-invite'
import { PENDING_EMAIL_COOKIE, PENDING_EMAIL_TTL_SECONDS, normalizePendingEmail } from '@/lib/pending-email'

export type AuthState = { error: string } | undefined
export type ResendState = { error: string } | { sent: true } | undefined

function confirmUrlFor(next: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return next === '/dashboard' ? `${site}/auth/confirm` : `${site}/auth/confirm?next=${encodeURIComponent(next)}`
}

/**
 * Remember which address is waiting on a confirmation link so the check-email
 * page can offer a resend. httpOnly, short-lived, never in the URL.
 */
async function rememberPendingEmail(email: string) {
  const store = await cookies()
  store.set(PENDING_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PENDING_EMAIL_TTL_SECONDS,
  })
}

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
  if (error) {
    // The account exists but the link was never clicked (or never arrived).
    // Send them to the page that can resend it instead of a dead-end error.
    if (error.code === 'email_not_confirmed') {
      await rememberPendingEmail(v.email.toLowerCase())
      redirect('/sign-up/check-email')
    }
    return { error: error.message }
  }

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

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: confirmUrlFor(next),
      data: { has_password: true },
    },
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  // Email-confirmation off → session is live immediately; skip the "check email"
  // page and, for an invitation, join the household right away.
  if (data.session) redirect(next === '/dashboard' ? '/onboarding' : await landingFor(next))
  await rememberPendingEmail(v.email.toLowerCase())
  redirect('/sign-up/check-email')
}

/**
 * Re-send the confirmation link to the address remembered at sign-up. Supabase
 * rate-limits this per address (one a minute) and reports that as an error we
 * pass straight through. The invitation `next`, if any, was baked into the
 * first email; a resend goes to the plain dashboard landing.
 */
export async function resendConfirmation(_prev: ResendState): Promise<ResendState> {
  const store = await cookies()
  const email = normalizePendingEmail(store.get(PENDING_EMAIL_COOKIE)?.value)
  if (!email) return { error: 'That link has expired. Sign up again to get a fresh one.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: confirmUrlFor('/dashboard') },
  })
  if (error) return { error: error.message }
  return { sent: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
