import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from './reset-form'

/**
 * /reset-password - landing for the emailed recovery link. /auth/confirm has
 * already exchanged the token for a session by the time we get here; with no
 * session the link is stale, so hand them back to the request page.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/forgot-password?expired=1')

  return <ResetPasswordForm email={data.user.email ?? ''} />
}
