import Link from 'next/link'

/**
 * /sign-up/check-email — shown after sign-up when email confirmation is ON
 * (Supabase returns no session). Static page; no form.
 */
export default function CheckEmailPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-6"
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
          We sent you a confirmation link. Click it, and we'll set up your household.
        </p>
        <Link
          href="/sign-in"
          className="mt-7 inline-flex items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-5 py-3 text-[13px] font-semibold text-[var(--color-ink)] hover:border-[var(--color-ink)]"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
