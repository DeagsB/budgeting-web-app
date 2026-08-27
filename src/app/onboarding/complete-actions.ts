'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

/**
 * Marks the guided flow finished (Finish or Skip on any step past household)
 * and lands on the dashboard. The RPC only flips the flag for the caller's
 * own household and only when they are its owner.
 */
export async function completeOnboarding(): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_onboarding')
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
