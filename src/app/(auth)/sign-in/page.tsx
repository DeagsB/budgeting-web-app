'use client'

import { useActionState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { signIn, type AuthState } from './actions'

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  )
}

function SignInInner() {
  const sp = useSearchParams()
  const next = sp.get('next') || '/dashboard'
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, undefined)

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-6 pt-[calc(env(safe-area-inset-top)+24px)]"
      style={{ background: 'var(--color-cream, #F6F1E7)' }}
    >
      <div className="w-full max-w-[420px]">
        <header className="mb-8 flex flex-col items-center gap-3 text-center">
          <MapleMark />
          <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)]">
            Welcome back.
          </h1>
          <p className="text-[14px] text-[var(--color-ink-2)]">
            Sign in to your household.
          </p>
        </header>

        <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 md:p-7">
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next} />
            <Field label="Email">
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                className="maple-input"
                placeholder="you@domain.ca"
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="maple-input"
                placeholder="At least 8 characters"
              />
            </Field>
            <Link
              href="/forgot-password"
              className="-mt-1 self-end py-1 text-[12.5px] font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:underline"
            >
              Forgot password?
            </Link>

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
              className="mt-1 inline-flex items-center justify-center rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-[var(--color-ink-2)]">
          New here?{' '}
          <Link
            href={`/sign-up${next !== '/dashboard' ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}

/** Small maple-leaf glyph drawn as SVG so it tints with the ink color. */
function MapleMark() {
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full"
      style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
      aria-hidden
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l1.8 3.6 3.9-.6-1.6 3.7 3.4 2-3.4 2 1.6 3.7-3.9-.6L12 20l-1.8-3.2-3.9.6 1.6-3.7-3.4-2 3.4-2-1.6-3.7 3.9.6L12 2z" />
      </svg>
    </div>
  )
}
