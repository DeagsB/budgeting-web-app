import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // If env vars are missing, we can't do much. Better to let it fail
    // gracefully or return the response without session refresh.
    // However, the app likely won't work anyway.
    return response
  }

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Verified user fetch — triggers session refresh if the access token expired.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data?.user
  } catch (e) {
    console.error('Supabase auth error in proxy:', e)
  }

  const { pathname } = request.nextUrl

  const isAuthRoute =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname.startsWith('/auth') ||
    // Public ingestion webhooks authenticate via per-household secret in the
    // request body, not via cookies — don't bounce unauth callers to /sign-in.
    pathname.startsWith('/api/ingest') ||
    // Plaid webhook (verified via signed JWT) and the scheduled cron route
    // (CRON_SECRET bearer) are called by external services with no cookie.
    pathname.startsWith('/api/plaid/webhook') ||
    pathname.startsWith('/api/cron') ||
    // PWA install assets must be reachable without a session. Browsers and
    // OS install prompts fetch these with no cookies attached.
    pathname === '/manifest.webmanifest' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname === '/icon' ||
    pathname === '/apple-icon' ||
    pathname === '/favicon.ico'

  // Unauthenticated users hitting a protected route → redirect to sign-in.
  if (!user && !isAuthRoute && pathname !== '/') {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Authenticated users hitting sign-in/sign-up → bounce to dashboard.
  if (user && (pathname === '/sign-in' || pathname === '/sign-up')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}
