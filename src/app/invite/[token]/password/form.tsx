'use client'

import { useActionState } from 'react'
import { setPassword, type PasswordState } from '../actions'

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(setPassword, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="maple-input"
          placeholder="At least 8 characters"
          autoFocus
        />
      </label>
      {state?.error && (
        <p
          role="alert"
          className="rounded-[12px] px-3 py-2 text-[13px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-[50px] w-full items-center justify-center rounded-full bg-[var(--color-ink)] text-[15px] font-semibold text-[var(--color-paper)] transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save and continue'}
      </button>
    </form>
  )
}
