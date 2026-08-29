'use client'

import { useState } from 'react'
import { CategoryPicker } from './category-picker'
import { NewCategoryInline } from './new-category-inline'

type Category = { id: string; parent_id: string | null; name: string }

/**
 * Inline one-tap categorizer shown directly under every uncategorized row -
 * no toggle to open it. Renders the household's up-to-6 most-used categories
 * as chips, then "More…" (a type-ahead over every category) and "+ New" as
 * the last two chips.
 *
 * The chips render as a single horizontal rail that scrolls under the
 * thumb (`overflow-x-auto` + `.hide-scroll`) instead of wrapping - a
 * wrapping strip runs 3-4 lines deep at 390px, which made every
 * uncategorized row balloon to ~400px tall. The rail bleeds past the row's
 * own horizontal padding (`-mx-5 px-5`) so it scrolls edge to edge while
 * the rest of the row content stays put.
 *
 * Purely presentational: picking a category - by chip, by the type-ahead, or
 * by creating a new one - just calls `onPick`. The row above owns the actual
 * save, the optimistic badge swap, and the error state (see row.tsx), so a
 * rejected save can restore this strip without QuickCategorize knowing why.
 */
export function QuickCategorize({
  categories,
  topCategoryIds,
  onPick,
  pending = false,
}: {
  categories: Category[]
  topCategoryIds: string[]
  onPick: (categoryId: string) => void
  pending?: boolean
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const byId = new Map(categories.map((c) => [c.id, c]))
  const topCats = topCategoryIds.map((id) => byId.get(id)).filter(Boolean) as Category[]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="hide-scroll -mx-5 flex flex-nowrap items-center gap-1.5 overflow-x-auto overflow-y-hidden px-5 snap-x">
        {topCats.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={pending}
            onClick={() => onPick(c.id)}
            className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border border-hair bg-cream px-3 text-[13px] font-semibold text-ink transition-colors hover:border-leaf hover:bg-leaf-soft disabled:opacity-50 snap-start"
          >
            {c.parent_id ? `↳ ${c.name}` : c.name}
          </button>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="inline-flex min-h-[44px] shrink-0 items-center whitespace-nowrap rounded-full border border-dashed border-hair px-3 text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink disabled:opacity-50 snap-start"
        >
          {pickerOpen ? 'Close' : 'More…'}
        </button>
        <div className="shrink-0 whitespace-nowrap snap-start">
          <NewCategoryInline categories={categories} onCreated={(id) => onPick(id)} variant="sheet" />
        </div>
      </div>

      {pickerOpen && (
        <CategoryPicker
          categories={categories}
          onPick={(id) => {
            setPickerOpen(false)
            onPick(id)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
