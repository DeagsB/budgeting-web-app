'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn, type AuthState } from '../actions'

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <header>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          New here?{' '}
          <Link href="/sign-up" className="font-medium text-gray-900 underline">
            Create an account
          </Link>
        </p>
      </header>

      <Suspense fallback={<SignInFormSkeleton />}>
        <SignInForm />
      </Suspense>
    </main>
  )
}

// Wrapped in <Suspense> above: useSearchParams() hook requires a Suspense
// boundary during static prerender (Next 16). Splitting keeps the skeleton
// render-able on the server without hitting the client-side query string.
function SignInForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signIn, undefined)
  const next = useSearchParams().get('next') ?? '/dashboard'

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

function SignInFormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-[62px] rounded bg-gray-100" />
      <div className="h-[62px] rounded bg-gray-100" />
      <div className="h-[38px] w-full rounded bg-gray-900/10" />
    </div>
  )
}
