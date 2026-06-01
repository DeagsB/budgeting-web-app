'use client'

import { useState, useTransition } from 'react'
import { setTransactionCategory } from './actions'
import { CategorySelect } from './category-select'
import { Button } from '@/components/ui/button'

type Category = { id: string; parent_id: string | null; name: string }

/**
 * Inline one-tap categorizer for an uncategorized transaction row. Surfaces the
 * household's most-used categories as chips (one tap assigns + revalidates),
 * with the full hierarchical select tucked behind "More…" for the long tail.
 *
 * Stays deliberately small: category only. Owner / description / splits live in
 * the full edit form and the triage queue.
 */
export function QuickCategorize({
  transactionId,
  categories,
  topCategoryIds,
  onDone,
}: {
  transactionId: string
  categories: Category[]
  topCategoryIds: string[]
  onDone?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [showAll, setShowAll] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const byId = new Map(categories.map((c) => [c.id, c]))
  const topCats = topCategoryIds.map((id) => byId.get(id)).filter(Boolean) as Category[]

  function apply(categoryId: string) {
    const fd = new FormData()
    fd.set('id', transactionId)
    fd.set('category_id', categoryId)
    setError(null)
    startTransition(async () => {
      try {
        await setTransactionCategory(fd)
        onDone?.()
      } catch {
        setError('Couldn’t save that category. Try again.')
      }
    })
  }

  return (
    <div className="rounded-lg border border-hair bg-paper p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
          Quick category
        </span>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="inline-flex min-h-[44px] items-center rounded-md px-2 text-[12px] font-semibold text-ink-2 hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Most-used categories — one tap to assign */}
      <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
        {topCats.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => apply(c.id)}
            className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-cream px-3 text-[12.5px] font-semibold text-ink transition-colors hover:border-leaf hover:bg-leaf-soft disabled:opacity-50"
          >
            {c.parent_id ? `↳ ${c.name}` : c.name}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-hair px-3 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
        >
          {showAll ? 'Less' : 'More…'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-maple-soft px-2.5 py-1.5 text-[12px] font-medium text-maple">
          {error}
        </p>
      )}

      {/* Full hierarchical picker for anything not in the quick set */}
      {showAll && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
              All categories
            </span>
            <CategorySelect
              categories={categories}
              value={value}
              onChange={setValue}
              compact
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending || !value}
            onClick={() => value && apply(value)}
          >
            {pending ? 'Saving…' : 'Apply'}
          </Button>
        </div>
      )}
    </div>
  )
}
