import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { AppShell } from './shell'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')

  const [{ data: household }, { data: me }] = await Promise.all([
    supabase.from('households').select('name').eq('id', ctx.householdId).single(),
    ctx.memberId
      ? supabase.from('members').select('display_name').eq('id', ctx.memberId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return (
    <AppShell
      householdName={household?.name ?? 'Household'}
      userEmail={user.email ?? ''}
      memberName={(me?.display_name as string | null) ?? null}
    >
      {children}
    </AppShell>
  )
}
