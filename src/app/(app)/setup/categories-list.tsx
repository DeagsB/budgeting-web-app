'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  renameCategory,
    archiveCategory,
  unarchiveCategory,
} from './actions'
import { createCategoryReturning } from '@/app/(app)/categories/actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { Field } from '@/components/ui/field'

type Cat = {
  id: string
  parent_id: string | null
  name: string
  archived: boolean
  /** Report shorthand (e.g. GROC). Only rendered when `withCodes` is set. */
  code?: string
}

const ADD_INPUT_ID = 'new-category'

/**
 * The one category list. Setup renders it bare; /categories renders it with
 * `withCodes` so the report shorthand is visible and editable. Both go through
 * the same server actions, so there is a single visual language and a single
 * code path for every category mutation.
 */
export function CategoriesList({
  categories,
  withCodes = false,
}: {
  categories: Cat[]
  withCodes?: boolean
}) {
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

  function focusAddForm() {
    const el = document.getElementById(ADD_INPUT_ID)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.focus()
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <AddCategory parents={parents.filter((p) => !p.archived)} withCodes={withCodes} />

      {categories.length === 0 ? (
        <EmptyState
          title="No categories yet"
          body="Categories are how you slice spending - Groceries, Rent, Transport. Add a top-level one, then nest sub-categories under it."
          action={
            <Button type="button" variant="primary" size="md" onClick={focusAddForm}>
              Add a category
            </Button>
          }
        />
      ) : (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-3">
              {parents.filter((p) => (show === 'archived' ? p.archived : !p.archived)).length}{' '}
              top-level
            </span>
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => setShow(show === 'archived' ? 'active' : 'archived')}
                aria-pressed={show === 'archived'}
                className="inline-flex min-h-[44px] items-center px-2 text-[12px] font-semibold text-ink-2 hover:text-ink hover:underline"
              >
                {show === 'archived' ? '← Back to active' : `Show archived (${archivedCount})`}
              </button>
            )}
          </div>

          {visibleParents.length === 0 ? (
            show === 'archived' ? (
              <EmptyState
                title="Nothing archived"
                body="Archived categories land here. They stay out of budgets and the transaction picker until you bring them back."
              />
            ) : (
              <EmptyState
                title="No active categories"
                body="Everything is archived. Restore one, or add a fresh category above."
                action={
                  <Button type="button" variant="primary" size="md" onClick={focusAddForm}>
                    Add a category
                  </Button>
                }
              />
            )
          ) : (
            <ul className="divide-y divide-hair border-y border-hair">
              {visibleParents.map((p) => (
                <CategoryBlock
                  key={p.id}
                  parent={p}
                  kids={(childrenOf.get(p.id) ?? []).filter((c) =>
                    show === 'archived' ? c.archived : !c.archived,
                  )}
                  withCodes={withCodes}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function AddCategory({ parents, withCodes }: { parents: Cat[]; withCodes: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <form
        ref={formRef}
        action={(fd) => {
          const name = String(fd.get('name') ?? '').trim()
          const parentId = String(fd.get('parent_id') ?? '').trim() || null
          const code = withCodes ? String(fd.get('code') ?? '').trim() || null : null
          if (!name) return
          setError(null)
          startTransition(async () => {
            const res = await createCategoryReturning({ name, parentId, code })
            if (res.ok) {
              formRef.current?.reset()
              document.getElementById(ADD_INPUT_ID)?.focus()
            } else {
              setError(res.error)
            }
          })
        }}
        className={
          withCodes
            ? 'grid gap-3 sm:grid-cols-[1fr_140px_180px_auto] sm:items-end'
            : 'grid gap-2 sm:grid-cols-[1fr_180px_auto] sm:items-end'
        }
      >
        {withCodes ? (
          <>
            <Field label="Name" htmlFor={ADD_INPUT_ID} required>
              <input
                id={ADD_INPUT_ID}
                name="name"
                type="text"
                required
                maxLength={80}
                placeholder="e.g. Groceries"
                className="maple-input"
              />
            </Field>
            <Field label="Code" htmlFor="new-category-code" hint="Optional, auto-filled">
              <input
                id="new-category-code"
                name="code"
                type="text"
                maxLength={40}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="GROC"
                className="maple-input font-mono uppercase"
              />
            </Field>
            <Field label="Parent" htmlFor="new-category-parent">
              <select
                id="new-category-parent"
                name="parent_id"
                className="maple-select"
                defaultValue=""
              >
                <option value="">Top level</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    under {p.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : (
          <>
            <input
              id={ADD_INPUT_ID}
              name="name"
              type="text"
              required
              maxLength={80}
              aria-label="New category name"
              placeholder="Category name, e.g. Groceries"
              className="maple-input"
            />
            <select
              name="parent_id"
              aria-label="Parent category"
              className="maple-select"
              defaultValue=""
            >
              <option value="">Top level</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  under {p.name}
                </option>
              ))}
            </select>
          </>
        )}
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

function CategoryBlock({
  parent,
  kids,
  withCodes,
}: {
  parent: Cat
  kids: Cat[]
  withCodes: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <li className="py-1.5">
      <CategoryRow
        cat={parent}
        top
        onToggle={() => setOpen(!open)}
        open={open}
        hasKids={kids.length > 0}
        withCodes={withCodes}
      />
      {open && kids.length > 0 && (
        <ul className="ml-9 mt-1 border-l border-hair pl-3">
          {kids.map((k) => (
            <li key={k.id} className="py-1">
              <CategoryRow cat={k} withCodes={withCodes} />
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
  withCodes,
}: {
  cat: Cat
  top?: boolean
  onToggle?: () => void
  open?: boolean
  hasKids?: boolean
  withCodes: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(cat.name)
  const [code, setCode] = useState(cat.code ?? '')
  const [pending, startTransition] = useTransition()

  function cancelEdit() {
    setValue(cat.name)
    setCode(cat.code ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        action={(fd) => {
          startTransition(async () => {
            await renameCategory(fd)
            setEditing(false)
          })
        }}
        className="flex flex-col gap-2 py-1 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="id" value={cat.id} />
        {withCodes ? (
          <>
            <Field label="Name" className="flex-1" required>
              <input
                name="name"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                required
                maxLength={80}
                className="maple-input"
              />
            </Field>
            <Field label="Code" className="sm:w-[140px]" required>
              <input
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                maxLength={40}
                pattern="[A-Za-z][A-Za-z0-9_.]{0,39}"
                title="Start with a letter; letters, digits, _ and . only"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="maple-input font-mono uppercase"
              />
            </Field>
          </>
        ) : (
          <input
            name="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
            maxLength={80}
            aria-label={`Rename category ${cat.name}`}
            className="maple-input flex-1"
          />
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={cancelEdit} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    // Mobile: name on its own line, actions stacked underneath (indented past
    // the expand toggle); from `sm` up, one row with actions on the right.
    // Same pattern as members-list so the two Setup lists read alike.
    <div
      className={
        'flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 ' +
        (cat.archived ? 'opacity-60' : '')
      }
    >
      <div className="flex min-w-0 items-center gap-2">
        {top && hasKids ? (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-[11px] text-ink-3 hover:text-ink"
            aria-label={open ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
            aria-expanded={open}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : null}
        <span
          className={
            top
              ? 'min-w-0 truncate font-serif text-[16px] text-ink'
              : 'min-w-0 truncate text-[14px] text-ink-2'
          }
        >
          {cat.name}
        </span>
        {withCodes && cat.code && (
          <span className="shrink-0 font-mono text-[11px] tracking-[0.02em] text-ink-3">
            {cat.code}
          </span>
        )}
      </div>
      <div
        className={
          '-ml-2 flex shrink-0 flex-wrap items-center gap-1 text-[12px] sm:ml-0 sm:justify-end sm:pl-0 ' +
          (top && hasKids ? 'pl-11' : 'pl-2')
        }
      >
        {!cat.archived && (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
            >
              {withCodes ? 'Edit' : 'Rename'}
            </button>
          </>
        )}
        {cat.archived ? (
          <UnarchiveButton id={cat.id} />
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

function UnarchiveButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <form
      action={(fd) => {
        start(async () => {
          await unarchiveCategory(fd)
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-50"
      >
        {pending ? 'Restoring…' : 'Unarchive'}
      </button>
    </form>
  )
}
