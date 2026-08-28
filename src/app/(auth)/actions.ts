'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { inviteTokenFromNext, safeNextPath } from '@/lib/invitations'
import { acceptInviteToken } from '@/lib/accept-invite'
import { PENDING_EMAIL_COOKIE, PENDING_EMAIL_TTL_SECONDS, normalizePendingEmail } from '@/lib/pending-email'
import { RESET_PASSWORD_PATH, isExistingAccountSignUp } from '@/lib/auth-signals'

/**
 * `code` lets the form render something smarter than the message alone -
 * `account_exists` gets "Sign in" / "Reset password" links on the sign-up page.
 */
export type AuthState = { error: string; code?: 'account_exists' } | undefined
export type ResendState = { error: string } | { sent: true } | undefined
export type ResetRequestState = { error: string } | { sent: true; email: string } | undefined

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

  // Already registered and confirmed: Supabase answers with a decoy user and
  // sends nothing (see isExistingAccountSignUp). Say so rather than sending
  // them to wait for an email that will never arrive.
  if (isExistingAccountSignUp(data.user)) {
    return {
      error: 'An account already exists for that email.',
      code: 'account_exists',
    }
  }

  revalidatePath('/', 'layout')
  // Email-confirmation off → session is live immediately; skip the "check email"
  // page and, for an invitation, join the household right away.
  if (data.session) redirect(next === '/dashboard' ? '/onboarding' : await landingFor(next))
  await rememberPendingEmail(v.email.toLowerCase())
  redirect('/sign-up/check-email')
}

/**
 * Email a password-reset link. The link runs through /auth/confirm, which
 * turns the recovery token into a session and lands on /reset-password.
 * Supabase deliberately answers the same way whether or not the address is
 * registered, so the form always reports "sent" unless sending itself failed
 * (rate limit, SMTP).
 */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = normalizePendingEmail(String(formData.get('email') ?? ''))
  if (!email) return { error: 'Enter a valid email address.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: confirmUrlFor(RESET_PASSWORD_PATH),
  })
  if (error) return { error: error.message }
  return { sent: true, email }
}

/**
 * Set a new password for the recovery session established by the emailed
 * link. Requires a live session - an expired or reused link never reaches
 * here because /auth/confirm bounces it to sign-in with the reason.
 */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' }
  if (password !== confirm) return { error: 'Those passwords don’t match.' }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/forgot-password?expired=1')

  const { error } = await supabase.auth.updateUser({ password, data: { has_password: true } })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
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
