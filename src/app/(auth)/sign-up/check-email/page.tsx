import Link from 'next/link'
import { cookies } from 'next/headers'
import { PENDING_EMAIL_COOKIE, normalizePendingEmail } from '@/lib/pending-email'
import { ResendButton } from './resend-button'

/**
 * /sign-up/check-email - shown after sign-up when email confirmation is ON
 * (Supabase returns no session), and after a sign-in attempt on an account
 * whose link was never clicked. The address comes from a short-lived cookie
 * set by those actions; when it has expired the resend offer is replaced by a
 * pointer back to sign-up.
 */
export default async function CheckEmailPage() {
  const store = await cookies()
  const email = normalizePendingEmail(store.get(PENDING_EMAIL_COOKIE)?.value)

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]"
      style={{ background: 'var(--color-cream, #F6F1E7)' }}
    >
      <div className="w-full max-w-[420px] text-center">
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
          aria-hidden
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h1 className="font-serif text-[32px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
          Check your inbox.
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          We sent a confirmation link
          {email ? (
            <>
              {' '}to <b className="break-all text-[var(--color-ink)]">{email}</b>.
            </>
          ) : (
            '.'
          )}{' '}
          Click it, and we&rsquo;ll set up your household.
        </p>

        <div className="mt-7">
          {email ? (
            <ResendButton />
          ) : (
            <p className="text-[13px] text-[var(--color-ink-2)]">
              Didn&rsquo;t get it?{' '}
              <Link href="/sign-up" className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
                Sign up again
              </Link>{' '}
              to get a fresh link.
            </p>
          )}
        </div>

        <Link
          href="/sign-in"
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-5 py-3 text-[13px] font-semibold text-[var(--color-ink)] hover:border-[var(--color-ink)]"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
