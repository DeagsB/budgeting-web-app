'use client'

import { useTransition } from 'react'
import { deleteSettlement } from './actions'

export function DeleteSettlementButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          if (!confirm('Delete this settlement?')) return
          await deleteSettlement(fd)
        })
      }
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
      >
        Delete
      </button>
    </form>
  )
}
