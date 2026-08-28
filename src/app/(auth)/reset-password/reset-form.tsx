'use client'

import { useActionState } from 'react'
import { updatePassword, type AuthState } from '../actions'

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, undefined)

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
            <LockIcon />
          </div>
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
            Choose a new password.
          </h1>
          <p className="text-[14px] leading-relaxed text-[var(--color-ink-2)]">
            For <b className="break-all text-[var(--color-ink)]">{email}</b>. You&rsquo;ll be signed in straight after.
          </p>
        </header>

        <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 md:p-7">
          <form action={formAction} className="flex flex-col gap-4">
            {/* Lets password managers file the new password under the right login. */}
            <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                New password
              </span>
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="maple-input"
                placeholder="At least 8 characters"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                Confirm password
              </span>
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="maple-input"
                placeholder="Same again"
              />
            </label>

            {state?.error && (
              <p
                className="rounded-[10px] px-3 py-2 text-[12.5px] font-medium"
                style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
              >
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-1 inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
