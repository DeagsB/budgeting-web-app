'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { addMember, renameMember, archiveMember, unarchiveMember } from './actions'
import { claimMember, removeMemberLogin, revokeInvitation } from './invite-actions'
import { InviteSheet } from './invite-sheet'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmButton } from '@/components/ui/confirm-button'

export type MemberView = {
  id: string
  name: string
  archived: boolean
  /** This member has a login attached. */
  linked: boolean
  /** The login attached is the current user. */
  isMe: boolean
  pendingInvite: { id: string; email: string; expiresAt: string } | null
}

export function MembersList({
  members,
  canManage,
  myMemberId,
}: {
  members: MemberView[]
  canManage: boolean
  myMemberId: string | null
}) {
  const [show, setShow] = useState<'active' | 'archived'>('active')
  const [inviting, setInviting] = useState<{ id: string; name: string } | null>(null)
  const visible = members.filter((m) => (show === 'archived' ? m.archived : !m.archived))
  const archivedCount = members.filter((m) => m.archived).length
  const activeCount = members.filter((m) => !m.archived).length
  const claimable = members.filter((m) => !m.archived && !m.linked)

  return (
    <div className="mt-3 flex flex-col gap-3">
      {myMemberId === null && claimable.length > 0 && <ClaimPicker members={claimable} />}

      <AddMember />

      {activeCount === 0 && archivedCount === 0 ? (
        <EmptyState
          title="Add the first member"
          body="A member is anyone whose money flows through this household. Each one can have their own login; only what they mark shared is visible to the others."
        />
      ) : (
        <>
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
              <MemberRow key={m.id} member={m} canManage={canManage} onInvite={() => setInviting({ id: m.id, name: m.name })} />
            ))}
          </ul>
        </>
      )}

      <InviteSheet open={inviting !== null} onClose={() => setInviting(null)} member={inviting} />
    </div>
  )
}

function ClaimPicker({ members }: { members: MemberView[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="rounded-[16px] border border-honey bg-paper-2 p-4">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-down">Which member are you?</div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Your login is not attached to a member yet, so you only see shared accounts. Pick yourself to see your own money.
      </p>
      <form
        action={(fd) =>
          start(async () => {
            const res = await claimMember(fd)
            if (res && 'error' in res) setError(res.error)
            else router.refresh()
          })
        }
        className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <select name="member_id" className="maple-select flex-1" required aria-label="Member">
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary" disabled={pending} className="shrink-0">
          {pending ? 'Saving…' : 'That’s me'}
        </Button>
      </form>
      {error && <p className="mt-2 text-[12.5px] font-medium text-maple">{error}</p>}
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

function StatusChip({ member }: { member: MemberView }) {
  const cls = 'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]'
  if (member.isMe) return <span className={`${cls} bg-leaf-soft text-leaf-deep`}>You</span>
  if (member.linked) return <span className={`${cls} bg-leaf-soft text-leaf-deep`}>Has login</span>
  if (member.pendingInvite) return <span className={`${cls} bg-paper-2 text-down`}>Invite pending</span>
  return null
}

function MemberRow({ member, canManage, onInvite }: { member: MemberView; canManage: boolean; onInvite: () => void }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(member.name)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

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

  const actionCls = 'inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline'

  return (
    <li className={'flex flex-col gap-1 py-2 ' + (member.archived ? 'opacity-60' : '')}>
      {/* Name + chips on one line, actions wrap beneath on narrow screens so a
          long name never gets squeezed to an ellipsis by three buttons. */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-[13px] font-semibold text-leaf"
            aria-hidden
          >
            {member.name.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-serif text-[16px] text-ink">{member.name}</span>
              <StatusChip member={member} />
            </div>
            {member.pendingInvite && !member.linked && (
              <div className="truncate text-[11.5px] text-ink-3">Invited {member.pendingInvite.email}</div>
            )}
          </div>
        </div>
        <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 pl-12 text-[12px] sm:ml-0 sm:justify-end sm:pl-0">
          {!member.archived && (
            <button type="button" onClick={() => setEditing(true)} className={actionCls}>
              Rename
            </button>
          )}
          {!member.archived && !member.linked && canManage && (
            <button type="button" onClick={onInvite} className={`${actionCls} text-leaf-deep`}>
              {member.pendingInvite ? 'Resend' : 'Invite'}
            </button>
          )}
          {!member.archived && member.pendingInvite && canManage && (
            <form
              action={(fd) =>
                startTransition(async () => {
                  const res = await revokeInvitation(fd)
                  if (res && 'error' in res) setError(res.error)
                  else router.refresh()
                })
              }
            >
              <input type="hidden" name="id" value={member.pendingInvite.id} />
              <button type="submit" disabled={pending} className={actionCls}>
                Revoke
              </button>
            </form>
          )}
          {!member.archived && member.linked && !member.isMe && canManage && (
            <ConfirmButton
              action={async (fd) => {
                const res = await removeMemberLogin(fd)
                if (res && 'error' in res) setError(res.error)
                else router.refresh()
              }}
              formData={{ member_id: member.id }}
              prompt={`Remove ${member.name}’s login?`}
              description="They lose access to the household. Their accounts and transactions stay, and you can invite them again later."
              confirmLabel="Remove login"
              destructive
              className="inline-flex min-h-[44px] items-center px-2 font-semibold text-maple hover:underline"
            >
              Remove login
            </ConfirmButton>
          )}
          {member.archived ? (
            <form action={unarchiveMember}>
              <input type="hidden" name="id" value={member.id} />
              <button type="submit" className={actionCls}>
                Unarchive
              </button>
            </form>
          ) : member.linked ? null : (
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
      </div>
      {error && <p className="text-[12px] font-medium text-maple">{error}</p>}
    </li>
  )
}
