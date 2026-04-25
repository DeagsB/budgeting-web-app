'use client'

import { useActionState, useRef, useEffect } from 'react'
import { createCategory, type CategoryState } from './actions'

export function AddCategoryForm({
  parents,
}: {
  parents: { id: string; name: string; code: string }[]
}) {
  const [state, formAction, pending] = useActionState<CategoryState, FormData>(
    createCategory,
    undefined,
  )
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state?.error) formRef.current?.reset()
  }, [pending, state])

  return (
    <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm sm:col-span-2">
        <span className="text-gray-700">Name</span>
        <input
          name="name"
          required
          maxLength={80}
          placeholder="e.g. Groceries"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-700">Code (optional)</span>
        <input
          name="code"
          maxLength={40}
          placeholder="auto"
          className="rounded border border-gray-300 px-3 py-2 font-mono uppercase tabular-nums"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm sm:col-span-3">
        <span className="text-gray-700">Parent (optional)</span>
        <select name="parent_id" className="maple-select">
          <option value="">— top-level —</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </label>

      <div className="sm:col-span-3 flex items-center justify-between">
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : <span />}
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add category'}
        </button>
      </div>
    </form>
  )
}
