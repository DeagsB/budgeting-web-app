'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signUp, type AuthState } from '../actions'

export default function SignUpPage() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(signUp, undefined)

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <header>
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Already have one?{' '}
          <Link href="/sign-in" className="font-medium text-gray-900 underline">
            Sign in
          </Link>
        </p>
      </header>

      <form action={formAction} className="flex flex-col gap-4">
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
            autoComplete="new-password"
            required
            minLength={8}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <span className="text-xs text-gray-500">At least 8 characters.</span>
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
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </main>
  )
}
