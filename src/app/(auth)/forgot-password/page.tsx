'use client'

import { useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { requestPasswordReset, type ResetRequestState } from '../actions'

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordInner />
    </Suspense>
  )
}

function ForgotPasswordInner() {
  const sp = useSearchParams()
  const expired = sp.get('expired') === '1'
  const [state, formAction, pending] = useActionState<ResetRequestState, FormData>(requestPasswordReset, undefined)
  const sent = !!state && 'sent' in state
  const error = state && 'error' in state ? state.error : null

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)]"
      style={{ background: 'var(--color-cream, #F6F1E7)' }}
    >
      <div className="w-full max-w-[420px]">
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
            aria-hidden
          >
            <KeyIcon />
          </div>
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
            {sent ? 'Check your inbox.' : 'Forgot your password?'}
          </h1>
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            {sent ? (
              <>
                If <b className="break-all text-[var(--color-ink)]">{state.email}</b> has an account, a reset link is on
                its way. Give it a minute, and check spam.
              </>
            ) : expired ? (
              'That reset link has expired or was already used. Enter your email and we’ll send a fresh one.'
            ) : (
              'Enter your email and we’ll send a link to choose a new one.'
            )}
          </p>
        </header>

        {!sent && (
          <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 md:p-7">
            <form action={formAction} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="maple-input"
                  placeholder="you@domain.ca"
                />
              </label>

              {error && (
                <p
                  className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
                  style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {pending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </div>
        )}

        <p className="mt-6 text-center text-[13px] text-[var(--color-ink-2)]">
          <Link href="/sign-in" className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  )
}

function KeyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
    </svg>
  )
}
