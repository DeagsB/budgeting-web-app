'use client'

import { useActionState, useRef, useEffect } from 'react'
import { addMember, type MemberState } from './actions'

export function AddMemberForm() {
  const [state, formAction, pending] = useActionState<MemberState, FormData>(addMember, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="text-gray-700">Display name</span>
        <input
          name="display_name"
          type="text"
          required
          maxLength={80}
          placeholder="e.g. Partner A"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add member'}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  )
}
