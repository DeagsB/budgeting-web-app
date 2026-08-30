'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { DEFAULT_LAYOUT, WIDGETS, type WidgetId } from './layout-config'

/**
 * Dashboard layout editor. Built on the shared <Sheet> primitive so it gets
 * aria-modal, Esc-to-close, focus trap, focus return and scroll lock for
 * free. Mounted only while open (the parent gates on `editOpen`), which is
 * what resets the draft. Loaded on demand (next/dynamic) so the sheet
 * primitive stays off the dashboard's cold-start critical path.
 */
export function DashboardEditor({
  current,
  onCancel,
  onSave,
}: {
  current: WidgetId[]
  onCancel: () => void
  onSave: (next: WidgetId[]) => void
}) {
  const [draft, setDraft] = useState<WidgetId[]>(current)

  function move(id: WidgetId, dir: -1 | 1) {
    setDraft((prev) => {
      const i = prev.indexOf(id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function remove(id: WidgetId) {
    setDraft((prev) => prev.filter((x) => x !== id))
  }
  function add(id: WidgetId) {
    setDraft((prev) => (prev.includes(id) ? prev : [...prev, id]))
  }

  const visible = draft
    .map((id) => WIDGETS.find((w) => w.id === id))
    .filter((w): w is (typeof WIDGETS)[number] => !!w)
  const hiddenWidgets = WIDGETS.filter((w) => !draft.includes(w.id))

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => setDraft(DEFAULT_LAYOUT)}
        className="-mx-2 inline-flex min-h-[44px] items-center px-2 text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
      >
        Reset to default
      </button>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
    </div>
  )

  return (
    <Sheet open onClose={onCancel} title="Edit dashboard" footer={footer}>
      <p className="-mt-2 mb-3 text-[12px] text-ink-2">
        Choose your cards and use the arrows to reorder them.
      </p>

      <div className="-mx-2">
          <div className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-ink-3">
            On the dashboard ({visible.length})
          </div>
          <ul className="flex flex-col gap-1.5">
            {visible.length === 0 && (
              <li className="rounded-md border border-dashed border-hair bg-paper px-3 py-3 text-center text-[12.5px] text-ink-2">
                Add a widget below to put it on the dashboard.
              </li>
            )}
            {visible.map((w, i) => (
              <li
                key={w.id}
                className="flex items-center gap-2 rounded-md border border-hair bg-paper px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-ink">
                    {w.label}
                  </div>
                  <div className="truncate text-[11.5px] text-ink-3">
                    {w.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => move(w.id, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${w.label} up`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
                >
                  <ArrowUpGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => move(w.id, 1)}
                  disabled={i === visible.length - 1}
                  aria-label={`Move ${w.label} down`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 disabled:opacity-30"
                >
                  <ArrowDownGlyph />
                </button>
                <button
                  type="button"
                  onClick={() => remove(w.id)}
                  aria-label={`Hide ${w.label}`}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-maple"
                >
                  <CloseGlyph />
                </button>
              </li>
            ))}
          </ul>

          {hiddenWidgets.length > 0 && (
            <>
              <div className="mt-4 px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-ink-3">
                Available widgets
              </div>
              <ul className="flex flex-col gap-1.5">
                {hiddenWidgets.map((w) => (
                  <li
                    key={w.id}
                    className="flex items-center gap-2 rounded-md border border-hair bg-paper-2 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-medium text-ink-2">
                        {w.label}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        {w.description}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => add(w.id)}
                      aria-label={`Add ${w.label} to dashboard`}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-paper px-3 text-[12px] font-semibold text-ink"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
      </div>
    </Sheet>
  )
}

function CloseGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
function ArrowUpGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
function ArrowDownGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}
