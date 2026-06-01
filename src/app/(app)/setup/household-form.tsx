'use client'

import { useState, useTransition } from 'react'
import { renameHousehold } from './actions'
import { Button } from '@/components/ui/button'

/** Inline-editable household name. Click the name → becomes an input. */
export function HouseholdForm({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [pending, startTransition] = useTransition()

  if (!editing) {
    return (
      <div className="mt-3 flex items-center justify-between gap-4">
        <span className="font-serif text-[28px] leading-[1.1] tracking-[-0.02em] text-ink">
          {name || 'Untitled household'}
        </span>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)} className="shrink-0">
          Rename
        </Button>
      </div>
    )
  }

  return (
    <form
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
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
        aria-label="Household name"
        className="maple-input flex-1 font-serif text-[22px] tracking-[-0.01em]"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(name)
            setEditing(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
