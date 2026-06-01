'use client'

import { useState, useTransition } from 'react'
import { addMember, renameMember, archiveMember, unarchiveMember } from './actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmButton } from '@/components/ui/confirm-button'

type Member = { id: string; name: string; archived: boolean }

export function MembersList({ members }: { members: Member[] }) {
  const [show, setShow] = useState<'active' | 'archived'>('active')
  const visible = members.filter((m) => (show === 'archived' ? m.archived : !m.archived))
  const archivedCount = members.filter((m) => m.archived).length
  const activeCount = members.filter((m) => !m.archived).length

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Add */}
      <AddMember />

      {/* First-run guidance — no active members yet and nothing archived either */}
      {activeCount === 0 && archivedCount === 0 ? (
        <EmptyState
          title="Add the first member"
          body="A member is anyone whose money flows through this household. You can assign accounts, transactions, and budgets to each one — or mark them shared."
        />
      ) : (
        <>
          {/* List header */}
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-3">
              {visible.length} {show === 'archived' ? 'archived' : 'active'}
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
            {visible.length === 0 && (
              <li className="py-6 text-center text-[13.5px] text-ink-2">
                {show === 'archived' ? 'Nothing archived.' : 'Add someone above.'}
              </li>
            )}
            {visible.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function AddMember() {
  const [pending, startTransition] = useTransition()
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await addMember(fd)
          const el = document.getElementById('new-member') as HTMLInputElement | null
          if (el) el.value = ''
        })
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <input
        id="new-member"
        name="name"
        type="text"
        required
        maxLength={80}
        aria-label="New member name"
        placeholder="Add a member — first name is fine"
        className="maple-input flex-1"
      />
      <Button type="submit" variant="primary" size="md" disabled={pending} className="shrink-0">
        {pending ? 'Adding…' : 'Add'}
      </Button>
    </form>
  )
}

function MemberRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(member.name)
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
        <form
          action={(fd) => {
            startTransition(async () => {
              await renameMember(fd)
              setEditing(false)
            })
          }}
          className="flex flex-1 items-center gap-2"
        >
          <input type="hidden" name="id" value={member.id} />
          <input
            name="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            required
            maxLength={80}
            aria-label={`Rename member ${member.name}`}
            className="maple-input flex-1"
          />
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </form>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(member.name)
            setEditing(false)
          }}
        >
          Cancel
        </Button>
      </li>
    )
  }

  return (
    <li
      className={
        'flex items-center justify-between gap-3 py-2 ' + (member.archived ? 'opacity-60' : '')
      }
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-[13px] font-semibold text-leaf"
          aria-hidden
        >
          {member.name.charAt(0).toUpperCase() || '?'}
        </div>
        <span className="truncate font-serif text-[16px] text-ink">{member.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-[12px]">
        {!member.archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
          >
            Rename
          </button>
        )}
        {member.archived ? (
          <form action={unarchiveMember}>
            <input type="hidden" name="id" value={member.id} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
            >
              Unarchive
            </button>
          </form>
        ) : (
          <ConfirmButton
            action={archiveMember}
            formData={{ id: member.id }}
            prompt={`Archive “${member.name}”?`}
            description="Archived members are hidden from pickers but their accounts and transactions stay intact. You can unarchive them anytime."
            confirmLabel="Archive"
            destructive
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-maple hover:underline"
          >
            Archive
          </ConfirmButton>
        )}
      </div>
    </li>
  )
}
