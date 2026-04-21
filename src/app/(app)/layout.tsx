import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { AppShell } from './shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')

  const { data: household } = await supabase
    .from('households')
    .select('name')
    .eq('id', ctx.householdId)
    .single()

  return (
    <AppShell householdName={household?.name ?? 'Household'} userEmail={user.email ?? ''}>
      {children}
    </AppShell>
  )
}
