'use client'

import { useState, useTransition } from 'react'
import { renameHousehold } from './actions'

/** Inline-editable household name. Click the name → becomes an input. */
export function HouseholdForm({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <span className="font-serif text-[28px] leading-[1.1] tracking-[-0.02em] text-[var(--color-ink)]">
          {name || 'Untitled household'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
        >
          Rename
        </button>
      </div>
    )
  }

  return (
    <form
      className="mt-3 flex items-center gap-2"
      action={(fd) => {
        startTransition(async () => {
          await renameHousehold(fd)
          setEditing(false)
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="name"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        required
        maxLength={80}
        className="maple-input font-serif text-[22px] tracking-[-0.01em]"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)] disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(name)
          setEditing(false)
        }}
        className="text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
      >
        Cancel
      </button>
    </form>
  )
}
