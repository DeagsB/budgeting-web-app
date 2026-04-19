'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  redirect(String(formData.get('next') || '/dashboard'))
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const v = validate(formData)
  if (typeof v === 'string') return { error: v }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: v.email,
    password: v.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/auth/confirm`,
    },
  })
  if (error) return { error: error.message }

  revalidatePath('/', 'layout')
  // Email-confirmation off → session is live immediately; skip the "check email" page.
  if (data.session) redirect('/onboarding')
  redirect('/sign-up/check-email')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/')
}
