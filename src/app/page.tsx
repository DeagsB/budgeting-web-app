import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Root URL is now a pure router: signed-in users land in the app, everyone
// else lands at sign-in. No marketing/intro page - installed as a PWA, the
// user wants to see their data, not a wordmark.
export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  redirect(data?.user ? '/dashboard' : '/sign-in')
}
