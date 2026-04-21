'use client'

import { useState, useTransition } from 'react'
import { addMember, renameMember, archiveMember, unarchiveMember } from './actions'

type Member = { id: string; name: string; archived: boolean }

export function MembersList({ members }: { members: Member[] }) {
  const [show, setShow] = useState<'active' | 'archived'>('active')
  const visible = members.filter((m) => (show === 'archived' ? m.archived : !m.archived))
  const archivedCount = members.filter((m) => m.archived).length

  return (
    <div className="mt-3 flex flex-col gap-3">
      {/* Add */}
      <AddMember />

      {/* List header */}
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-[12px] text-[var(--color-ink-3)]">
          {visible.length} {show === 'archived' ? 'archived' : 'active'}
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
        {visible.length === 0 && (
          <li className="py-6 text-center text-[13.5px] text-[var(--color-ink-2)]">
            {show === 'archived' ? 'Nothing archived.' : 'Add someone above.'}
          </li>
        )}
        {visible.map((m) => (
          <MemberRow key={m.id} member={m} />
        ))}
      </ul>
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
      className="flex items-center gap-2"
    >
      <input
        id="new-member"
        name="name"
        type="text"
        required
        maxLength={80}
        placeholder="Add a member — first name is fine"
        className="maple-input flex-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex shrink-0 items-center rounded-full bg-[var(--color-ink)] px-4 py-2.5 text-[12.5px] font-semibold text-[var(--color-paper)] disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add'}
      </button>
    </form>
  )
}

function MemberRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(member.name)

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-3">
        <form
          action={async (fd) => {
            await renameMember(fd)
            setEditing(false)
          }}
          className="flex flex-1 items-center gap-2"
        >
          <input type="hidden" name="id" value={member.id} />
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
        </form>
        <button
          type="button"
          onClick={() => {
            setValue(member.name)
            setEditing(false)
          }}
          className="text-[12px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
        >
          Cancel
        </button>
      </li>
    )
  }

  return (
    <li className={'group flex items-center justify-between gap-3 py-3 ' + (member.archived ? 'opacity-50' : '')}>
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <span className="font-serif text-[16px] text-[var(--color-ink)]">{member.name}</span>
      </div>
      <div className="flex items-center gap-3 text-[12px] opacity-60 transition-opacity group-hover:opacity-100">
        {!member.archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            Rename
          </button>
        )}
        {member.archived ? (
          <form action={unarchiveMember}>
            <input type="hidden" name="id" value={member.id} />
            <button type="submit" className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline">
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveMember}>
            <input type="hidden" name="id" value={member.id} />
            <button type="submit" className="font-semibold hover:underline" style={{ color: 'var(--color-maple)' }}>
              Archive
            </button>
          </form>
        )}
      </div>
    </li>
  )
}
