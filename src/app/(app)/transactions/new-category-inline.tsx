'use client'

import { useState, useTransition } from 'react'
import { createCategoryReturning } from '@/app/(app)/categories/actions'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

type Category = { id: string; parent_id: string | null; name: string }

/**
 * "+ New" affordance for the transaction categorizer: create a category at the
 * exact moment you need it and apply it in one step. Drops into a chip row.
 *
 * `variant`:
 *  - `sheet`  - opens the shared bottom-sheet (for surfaces not already inside a
 *    Sheet, e.g. the inline QuickCategorize on a row).
 *  - `inline` - expands a small form in place (for the triage card, which is
 *    already rendered inside a Sheet - avoids stacking sheet-on-sheet).
 *
 * `onCreated(id, name, parentId)` fires once the category exists so the caller
 * can immediately assign it.
 */
export function NewCategoryInline({
  categories,
  defaultParentId = '',
  onCreated,
  variant = 'sheet',
}: {
  categories: Category[]
  defaultParentId?: string
  onCreated: (id: string, name: string, parentId: string | null) => void
  variant?: 'sheet' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState(defaultParentId)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const parents = categories.filter((c) => !c.parent_id)

  function reset() {
    setName('')
    setParentId(defaultParentId)
    setError(null)
  }

  function close() {
    reset()
    setOpen(false)
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name.')
      return
    }
    setError(null)
    start(async () => {
      const res = await createCategoryReturning({ name: trimmed, parentId: parentId || null })
      if (res.ok) {
        onCreated(res.id, trimmed, parentId || null)
        close()
      } else {
        setError(res.error)
      }
    })
  }

  const form = (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          maxLength={80}
          placeholder="e.g. Groceries"
          className="maple-input"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Parent (optional)
        </span>
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          aria-label="Parent category"
          className="maple-select"
        >
          <option value="">- Top level -</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              under {p.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="rounded-md bg-maple-soft px-2.5 py-1.5 text-[12px] font-medium text-maple">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={pending}
          onClick={submit}
          className="flex-1"
        >
          {pending ? 'Creating…' : 'Create & apply'}
        </Button>
        <Button type="button" variant="ghost" size="md" disabled={pending} onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  )

  const trigger = (
    <button
      type="button"
      disabled={pending}
      onClick={() => setOpen(true)}
      className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-dashed border-hair px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:border-leaf hover:text-ink disabled:opacity-50"
    >
      <span aria-hidden className="text-[15px] leading-none">
        +
      </span>{' '}
      New
    </button>
  )

  if (variant === 'inline') {
    if (open) {
      return (
        <div className="w-full basis-full rounded-lg border border-hair bg-cream-2 p-3">{form}</div>
      )
    }
    return trigger
  }

  return (
    <>
      {trigger}
      <Sheet open={open} onClose={close} title="New category">
        {form}
      </Sheet>
    </>
  )
}
