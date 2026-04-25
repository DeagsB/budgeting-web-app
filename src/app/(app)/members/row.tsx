'use client'

import { useState } from 'react'
import { renameMember, deleteMember } from './actions'
import { ConfirmButton } from '@/components/ui/confirm-button'

export function MemberRow({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false)

  return (
    <li className="flex items-center justify-between border-b border-gray-100 px-6 py-3 last:border-b-0">
      {editing ? (
        <form
          action={async (fd) => {
            await renameMember(fd)
            setEditing(false)
          }}
          className="flex flex-1 items-center gap-2"
        >
          <input type="hidden" name="id" value={id} />
          <input
            name="display_name"
            defaultValue={name}
            required
            maxLength={80}
            autoFocus
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
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
      ) : (
        <>
          <span className="text-sm font-medium text-gray-900">{name}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Rename
            </button>
            <ConfirmButton
              action={deleteMember}
              formData={{ id }}
              prompt={`Remove member "${name}"?`}
              description="Their accounts and transactions stay; they're just no longer assignable."
              confirmLabel="Remove"
              destructive
              className="text-xs text-red-600 hover:text-red-800"
            >
              Remove
            </ConfirmButton>
          </div>
        </>
      )}
    </li>
  )
}
