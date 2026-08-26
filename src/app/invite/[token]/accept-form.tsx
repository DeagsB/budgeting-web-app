'use client'

import { useActionState } from 'react'
import { acceptInvitation, type AcceptState } from './actions'

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<AcceptState, FormData>(acceptInvitation, undefined)
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
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
        {pending ? 'Joining…' : 'Accept and join'}
      </button>
    </form>
  )
}
