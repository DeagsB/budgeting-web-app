'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptInvitationById } from './actions'

export type PendingInvite = { id: string; household_name: string; member_name: string }

/** Shown above the create-household form when an invite is waiting for this email. */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (invites.length === 0) return null
  return (
    <div className="mb-6 rounded-[16px] border border-[var(--color-leaf-soft)] bg-[var(--color-leaf-tint)] p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-leaf-deep)]">
        You have been invited
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-serif text-[17px] text-[var(--color-ink)]">{inv.household_name}</div>
              <div className="truncate text-[12px] text-[var(--color-ink-2)]">as {inv.member_name}</div>
            </div>
            <form
              action={(fd) =>
                start(async () => {
                  const res = await acceptInvitationById(fd)
                  if (res && 'error' in res) setError(res.error)
                  else router.replace('/dashboard')
                })
              }
            >
              <input type="hidden" name="id" value={inv.id} />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-[44px] items-center justify-center rounded-full bg-[var(--color-ink)] px-5 text-[13.5px] font-semibold text-[var(--color-paper)] disabled:opacity-50"
              >
                {pending ? 'Joining…' : 'Join'}
              </button>
            </form>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12.5px] font-medium text-[var(--color-maple)]">{error}</p>}
      <p className="mt-3 text-[12px] text-[var(--color-ink-3)]">Or start your own household below.</p>
    </div>
  )
}
