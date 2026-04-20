'use client'

import { useState } from 'react'
import { updateCategory, archiveCategory, unarchiveCategory } from './actions'

type Cat = {
  id: string
  parent_id: string | null
  name: string
  code: string
  archived_at: string | null
}

export function CategoryRow({
  category,
  depth,
  archived,
}: {
  category: Cat
  depth: number
  archived: boolean
}) {
  const [editing, setEditing] = useState(false)
  const indent = depth === 0 ? 'pl-6' : 'pl-14'

  if (editing) {
    return (
      <div className={`${indent} border-t border-gray-100 py-3 pr-6 first:border-t-0`}>
        <form
          action={async (fd) => {
            await updateCategory(fd)
            setEditing(false)
          }}
          className="grid gap-2 sm:grid-cols-[1fr_160px_auto_auto]"
        >
          <input type="hidden" name="id" value={category.id} />
          <input
            name="name"
            defaultValue={category.name}
            required
            maxLength={80}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <input
            name="code"
            defaultValue={category.code}
            required
            maxLength={40}
            className="rounded border border-gray-300 px-2 py-1 font-mono text-sm uppercase"
          />
          <button type="submit" className="text-sm font-medium text-gray-900 underline">
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            Cancel
          </button>
        </form>
      </div>
    )
  }

  return (
    <div
      className={
        `${indent} flex items-center justify-between gap-4 border-t border-gray-100 py-2 pr-6 first:border-t-0 ` +
        (archived ? 'opacity-50' : '')
      }
    >
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className={depth === 0 ? 'font-medium text-gray-900' : 'text-gray-800'}>
          {category.name}
        </span>
        <span className="font-mono text-xs text-gray-500">{category.code}</span>
      </div>
      <div className="flex items-center gap-3">
        {!archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            Edit
          </button>
        )}
        {archived ? (
          <form action={unarchiveCategory}>
            <input type="hidden" name="id" value={category.id} />
            <button type="submit" className="text-xs text-gray-500 hover:text-gray-900">
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveCategory}>
            <input type="hidden" name="id" value={category.id} />
            <button type="submit" className="text-xs text-red-600 hover:text-red-800">
              Archive
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
