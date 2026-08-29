'use client'

import { useMemo, useState, type KeyboardEvent } from 'react'

type Category = { id: string; parent_id: string | null; name: string }

/**
 * Type-ahead category picker rendered in place under an uncategorized row's
 * chip strip (the "More…" chip). Flattens the category tree into
 * "Parent > Child" labels so one search box reaches every category without
 * drilling through the grouped `<select>` used elsewhere.
 *
 * Enter picks the top (first) match; Esc closes without picking.
 */
export function CategoryPicker({
  categories,
  onPick,
  onClose,
}: {
  categories: Category[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  const options = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]))
    return categories.map((c) => ({
      id: c.id,
      label: c.parent_id ? `${byId.get(c.parent_id)?.name ?? '-'} > ${c.name}` : c.name,
    }))
  }, [categories])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0) onPick(filtered[0].id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-hair bg-paper p-2">
      <input
        type="text"
        inputMode="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search categories…"
        aria-label="Search categories"
        className="maple-input"
      />
      <ul className="max-h-[240px] overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-2 py-3 text-[13px] text-ink-3">No matches.</li>
        ) : (
          filtered.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => onPick(o.id)}
                className="flex min-h-[44px] w-full items-center rounded-md px-2 text-left text-[13.5px] text-ink transition-colors hover:bg-cream-2"
              >
                {o.label}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
