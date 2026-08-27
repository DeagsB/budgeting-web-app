import { type NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { inviteTokenFromNext, safeNextPath } from '@/lib/invitations'
import { acceptInviteToken } from '@/lib/accept-invite'

// Supabase's email links (sign-up confirmation, invite, magic link) land here
// in two shapes:
//   1. PKCE flow:         ?code=<uuid>[&next=/path]
//   2. Legacy OTP flow:   ?token_hash=<hash>&type=<email-otp-type>[&next=/path]
// `next` is constrained to a same-origin path so the link cannot be turned
// into an open redirect. When it points at an invitation, the household is
// joined here: the link was clicked from the invitation itself and the email
// has now been proved, so there is nothing left to confirm.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = safeNextPath(searchParams.get('next'))
  const supabase = await createClient()

  const code = searchParams.get('code')
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`)
    }
    return NextResponse.redirect(`${origin}${await landingFor(next)}`)
  }

  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) {
      return NextResponse.redirect(`${origin}/sign-in?error=${encodeURIComponent(error.message)}`)
    }
    return NextResponse.redirect(`${origin}${await landingFor(next)}`)
  }

  return NextResponse.redirect(`${origin}/sign-in?error=missing_token`)
}

/** Accept an invitation carried in `next`; on failure fall through to its page. */
async function landingFor(next: string): Promise<string> {
  const token = inviteTokenFromNext(next)
  if (!token) return next
  const accepted = await acceptInviteToken(token)
  return accepted.ok ? '/onboarding/welcome' : next
}
