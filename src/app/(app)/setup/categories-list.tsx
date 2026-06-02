'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  renameCategory,
  toggleRollover,
  archiveCategory,
  unarchiveCategory,
} from './actions'
import { createCategoryReturning } from '@/app/(app)/categories/actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmButton } from '@/components/ui/confirm-button'

type Cat = {
  id: string
  parent_id: string | null
  name: string
  rollover: boolean
  archived: boolean
}

export function CategoriesList({ categories }: { categories: Cat[] }) {
  const [show, setShow] = useState<'active' | 'archived'>('active')

  const { parents, childrenOf } = useMemo(() => {
    const p = categories.filter((c) => !c.parent_id)
    const co = new Map<string, Cat[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const arr = co.get(c.parent_id) ?? []
      arr.push(c)
      co.set(c.parent_id, arr)
    }
    return { parents: p, childrenOf: co }
  }, [categories])

  const archivedCount = categories.filter((c) => c.archived).length

  const visibleParents = parents.filter((p) =>
    show === 'archived'
      ? p.archived || (childrenOf.get(p.id) ?? []).some((c) => c.archived)
      : !p.archived,
  )

  return (
    <div className="mt-3 flex flex-col gap-3">
      <AddCategory parents={parents.filter((p) => !p.archived)} />

      {categories.length === 0 ? (
        <EmptyState
          title="Start with a few categories"
          body="Categories are how you slice spending — Groceries, Rent, Transport. Add a top-level one above, then nest sub-categories under it."
        />
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-3">
              {parents.filter((p) => (show === 'archived' ? p.archived : !p.archived)).length}{' '}
              top-level
            </span>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShow(show === 'archived' ? 'active' : 'archived')}
                className="inline-flex min-h-[44px] items-center text-[12px] font-semibold text-ink-2 hover:text-ink hover:underline"
              >
                {show === 'archived' ? '← Active' : `Archived (${archivedCount}) →`}
              </button>
            )}
          </div>

          <ul className="divide-y divide-hair border-y border-hair">
            {visibleParents.length === 0 && (
              <li className="py-6 text-center text-[13.5px] text-ink-2">
                {show === 'archived' ? 'Nothing archived.' : 'Add a category above.'}
              </li>
            )}
            {visibleParents.map((p) => (
              <CategoryBlock
                key={p.id}
                parent={p}
                kids={(childrenOf.get(p.id) ?? []).filter((c) =>
                  show === 'archived' ? c.archived : !c.archived,
                )}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function AddCategory({ parents }: { parents: Cat[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <form
        action={(fd) => {
          const name = String(fd.get('name') ?? '').trim()
          const parentId = String(fd.get('parent_id') ?? '').trim() || null
          if (!name) return
          setError(null)
          startTransition(async () => {
            const res = await createCategoryReturning({ name, parentId })
            if (res.ok) {
              const el = document.getElementById('new-category') as HTMLInputElement | null
              if (el) el.value = ''
            } else {
              setError(res.error)
            }
          })
        }}
        className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"
      >
        <input
          id="new-category"
          name="name"
          type="text"
          required
          maxLength={60}
          aria-label="New category name"
          placeholder="Category name — e.g. Groceries"
          className="maple-input"
        />
        <select name="parent_id" aria-label="Parent category" className="maple-select" defaultValue="">
          <option value="">— Top level —</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              under {p.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" size="md" disabled={pending} className="shrink-0">
          {pending ? 'Adding…' : 'Add'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-[12px] font-medium text-maple">
          {error}
        </p>
      )}
    </div>
  )
}

function CategoryBlock({ parent, kids }: { parent: Cat; kids: Cat[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-1.5">
      <CategoryRow
        cat={parent}
        top
        onToggle={() => setOpen(!open)}
        open={open}
        hasKids={kids.length > 0}
      />
      {open && kids.length > 0 && (
        <ul className="ml-9 mt-1 border-l border-hair pl-3">
          {kids.map((k) => (
            <li key={k.id} className="py-1">
              <CategoryRow cat={k} />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function CategoryRow({
  cat,
  top,
  onToggle,
  open,
  hasKids,
}: {
  cat: Cat
  top?: boolean
  onToggle?: () => void
  open?: boolean
  hasKids?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(cat.name)
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <form
        action={(fd) => {
          startTransition(async () => {
            await renameCategory(fd)
            setEditing(false)
          })
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={cat.id} />
        <input
          name="name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          required
          maxLength={60}
          aria-label={`Rename category ${cat.name}`}
          className="maple-input flex-1"
        />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(cat.name)
            setEditing(false)
          }}
        >
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <div className={'flex items-center justify-between gap-3 ' + (cat.archived ? 'opacity-60' : '')}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {top && hasKids ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-11 w-7 shrink-0 items-center justify-center rounded text-[11px] text-ink-3 hover:text-ink"
            aria-label={open ? 'Collapse' : 'Expand'}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : top ? (
          <span className="h-11 w-7 shrink-0" />
        ) : null}
        <span
          className={
            top
              ? 'truncate font-serif text-[16px] text-ink'
              : 'truncate text-[14px] text-ink-2'
          }
        >
          {cat.name}
        </span>
        {cat.rollover && (
          <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-leaf">
            Rollover
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[12px]">
        {!cat.archived && (
          <>
            <form action={toggleRollover}>
              <input type="hidden" name="id" value={cat.id} />
              <input type="hidden" name="rollover" value={cat.rollover ? 'false' : 'true'} />
              <button
                type="submit"
                className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
              >
                {cat.rollover ? 'Stop rollover' : 'Rollover'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
            >
              Rename
            </button>
          </>
        )}
        {cat.archived ? (
          <form action={unarchiveCategory}>
            <input type="hidden" name="id" value={cat.id} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
            >
              Unarchive
            </button>
          </form>
        ) : (
          <ConfirmButton
            action={archiveCategory}
            formData={{ id: cat.id }}
            prompt={`Archive “${cat.name}”?`}
            description="Archived categories are hidden from budgets and the transaction picker. Existing transactions keep their category. You can unarchive anytime."
            confirmLabel="Archive"
            destructive
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-maple hover:underline"
          >
            Archive
          </ConfirmButton>
        )}
      </div>
    </div>
  )
}
