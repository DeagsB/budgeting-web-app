'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  addCategory,
  renameCategory,
  toggleRollover,
  archiveCategory,
  unarchiveCategory,
} from './actions'

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

      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[12px] text-[var(--color-ink-3)]">
          {parents.filter((p) => (show === 'archived' ? p.archived : !p.archived)).length} top-level
        </span>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setShow(show === 'archived' ? 'active' : 'archived')}
            className="text-[12px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            {show === 'archived' ? '← Active' : `Archived (${archivedCount}) →`}
          </button>
        )}
      </div>

      <ul className="divide-y divide-[var(--color-hair)] border-y border-[var(--color-hair)]">
        {visibleParents.length === 0 && (
          <li className="py-6 text-center text-[13.5px] text-[var(--color-ink-2)]">
            {show === 'archived' ? 'Nothing archived.' : 'Add a category above.'}
          </li>
        )}
        {visibleParents.map((p) => (
          <CategoryBlock
            key={p.id}
            parent={p}
            kids={(childrenOf.get(p.id) ?? []).filter((c) => (show === 'archived' ? c.archived : !c.archived))}
          />
        ))}
      </ul>
    </div>
  )
}

function AddCategory({ parents }: { parents: Cat[] }) {
  const [pending, startTransition] = useTransition()
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await addCategory(fd)
          const el = document.getElementById('new-category') as HTMLInputElement | null
          if (el) el.value = ''
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
        placeholder="Category name — e.g. Groceries"
        className="maple-input"
      />
      <select name="parent_id" className="maple-select" defaultValue="">
        <option value="">— Top level —</option>
        {parents.map((p) => (
          <option key={p.id} value={p.id}>
            under {p.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-paper)] disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}

function CategoryBlock({ parent, kids }: { parent: Cat; kids: Cat[] }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-2.5">
      <CategoryRow cat={parent} top onToggle={() => setOpen(!open)} open={open} hasKids={kids.length > 0} />
      {open && kids.length > 0 && (
        <ul className="ml-9 mt-1 border-l border-[var(--color-hair)] pl-3">
          {kids.map((k) => (
            <li key={k.id} className="py-1.5">
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

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await renameCategory(fd)
          setEditing(false)
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={cat.id} />
        <input
          name="name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="maple-input flex-1"
        />
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--color-paper)]"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            setValue(cat.name)
            setEditing(false)
          }}
          className="text-[12px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </form>
    )
  }

  return (
    <div className={'group flex items-center justify-between gap-3 ' + (cat.archived ? 'opacity-50' : '')}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {top && hasKids ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] text-[var(--color-ink-3)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : top ? (
          <span className="h-5 w-5 shrink-0" />
        ) : null}
        <span
          className={
            top
              ? 'truncate font-serif text-[16px] text-[var(--color-ink)]'
              : 'truncate text-[14px] text-[var(--color-ink-2)]'
          }
        >
          {cat.name}
        </span>
        {cat.rollover && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
          >
            Rollover
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[12px] opacity-60 transition-opacity group-hover:opacity-100">
        {!cat.archived && (
          <>
            <form action={toggleRollover}>
              <input type="hidden" name="id" value={cat.id} />
              <input type="hidden" name="rollover" value={cat.rollover ? 'false' : 'true'} />
              <button
                type="submit"
                className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
              >
                {cat.rollover ? 'Stop rollover' : 'Rollover'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
            >
              Rename
            </button>
          </>
        )}
        {cat.archived ? (
          <form action={unarchiveCategory}>
            <input type="hidden" name="id" value={cat.id} />
            <button type="submit" className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline">
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveCategory}>
            <input type="hidden" name="id" value={cat.id} />
            <button type="submit" className="font-semibold hover:underline" style={{ color: 'var(--color-maple)' }}>
              Archive
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
