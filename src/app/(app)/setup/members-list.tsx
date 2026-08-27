'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renameMember, archiveMember, unarchiveMember } from './actions'
import { claimMember, inviteMember, removeMemberLogin, revokeInvitation, type InviteState } from './invite-actions'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { InviteResult } from '@/components/invite-result'

export type MemberView = {
  id: string
  name: string
  archived: boolean
  /** This member has a login attached. */
  linked: boolean
  /** The login attached is the current user. */
  isMe: boolean
}

export type PendingInviteView = {
  id: string
  email: string
  role: string
  expiresAt: string
}

/**
 * Who is in the household, and who has been asked to join.
 *
 * People arrive by invitation only: the owner sends an email address a link,
 * and the member row appears when it is accepted - named by the invitee
 * during their own onboarding, not by whoever invited them. Rows here are
 * people who have already joined (plus any legacy slot from before invites
 * worked this way).
 */
export function MembersList({
  members,
  invites,
  canManage,
  myMemberId,
}: {
  members: MemberView[]
  invites: PendingInviteView[]
  canManage: boolean
  myMemberId: string | null
}) {
  const [show, setShow] = useState<'active' | 'archived'>('active')
  const visible = members.filter((m) => (show === 'archived' ? m.archived : !m.archived))
  const archivedCount = members.filter((m) => m.archived).length
  const activeCount = members.filter((m) => !m.archived).length
  const claimable = members.filter((m) => !m.archived && !m.linked)

  return (
    <div className="mt-3 flex flex-col gap-3">
      {myMemberId === null && claimable.length > 0 && <ClaimPicker members={claimable} />}

      {canManage && <InviteForm />}

      {activeCount === 0 && archivedCount === 0 && invites.length === 0 ? (
        <EmptyState
          title="Invite the first person"
          body="Everyone in a household signs in with their own login and sees their own accounts, joint accounts, and transactions shared with them. Send them an email invitation and they pick their own name when they join."
        />
      ) : (
        <>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-3">
              {visible.length} {show === 'archived' ? 'archived' : 'active'}
              {invites.length > 0 && show === 'active'
                ? ` · ${invites.length} invited`
                : ''}
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
            {visible.length === 0 && invites.length === 0 && (
              <li className="py-6 text-center text-[13.5px] text-ink-2">
                {show === 'archived' ? 'Nothing archived.' : 'Invite someone above.'}
              </li>
            )}
            {visible.map((m) => (
              <MemberRow key={m.id} member={m} canManage={canManage} />
            ))}
            {show === 'active' &&
              invites.map((i) => <InviteRow key={i.id} invite={i} canManage={canManage} />)}
          </ul>
        </>
      )}
    </div>
  )
}

/** Email + access level. The link is shown once, whether or not the mail went out. */
function InviteForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteMember, undefined)
  const [dismissed, setDismissed] = useState<InviteState>(undefined)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (state && 'ok' in state) router.refresh()
  }, [state, router])

  if (state && 'ok' in state && state !== dismissed) {
    return (
      <InviteResult
        inviteUrl={state.inviteUrl}
        emailSent={state.emailSent}
        emailError={state.emailError}
        onDone={() => {
          setDismissed(state)
          setRound((r) => r + 1)
        }}
        doneLabel="Invite someone else"
      />
    )
  }

  return (
    <form key={round} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Invite by email">
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              placeholder="them@domain.ca"
              className="maple-input"
            />
          </Field>
        </div>
        <div className="sm:w-[150px]">
          <Field label="Access">
            <select name="role" className="maple-select" defaultValue="member">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        </div>
        <Button type="submit" variant="primary" size="md" disabled={pending} className="shrink-0 sm:mb-[1px]">
          {pending ? 'Sending…' : 'Invite'}
        </Button>
      </div>
      {state && 'error' in state && (
        <p role="alert" className="rounded-[12px] bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple">
          {state.error}
        </p>
      )}
    </form>
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
        Your login is not attached to a member yet, so you only see joint accounts. Pick yourself to see your own money.
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

function StatusChip({ member }: { member: MemberView }) {
  const cls = 'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]'
  if (member.isMe) return <span className={`${cls} bg-leaf-soft text-leaf-deep`}>You</span>
  if (member.linked) return <span className={`${cls} bg-leaf-soft text-leaf-deep`}>Has login</span>
  return <span className={`${cls} bg-paper-2 text-down`}>No login</span>
}

const actionCls =
  'inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline'

/** An emailed invitation nobody has accepted yet. */
function InviteRow({ invite, canManage }: { invite: PendingInviteView; canManage: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-hair text-[13px] font-semibold text-ink-3"
            aria-hidden
          >
            ?
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[14px] text-ink-2">{invite.email}</span>
              <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-down">
                Invited
              </span>
            </div>
            <div className="truncate text-[11.5px] text-ink-3">
              {invite.role === 'admin' ? 'Admin · ' : ''}They pick their name when they join
            </div>
          </div>
        </div>
        {canManage && (
          <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 pl-12 text-[12px] sm:ml-0 sm:justify-end sm:pl-0">
            <form
              action={(fd) =>
                start(async () => {
                  const res = await revokeInvitation(fd)
                  if (res && 'error' in res) setError(res.error)
                  else router.refresh()
                })
              }
            >
              <input type="hidden" name="id" value={invite.id} />
              <button type="submit" disabled={pending} className={actionCls}>
                {pending ? 'Working…' : 'Revoke'}
              </button>
            </form>
          </div>
        )}
      </div>
      {error && <p className="text-[12px] font-medium text-maple">{error}</p>}
    </li>
  )
}

function MemberRow({ member, canManage }: { member: MemberView; canManage: boolean }) {
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
          </div>
        </div>
        <div className="-ml-2 flex shrink-0 flex-wrap items-center gap-1 pl-12 text-[12px] sm:ml-0 sm:justify-end sm:pl-0">
          {!member.archived && (
            <button type="button" onClick={() => setEditing(true)} className={actionCls}>
              Rename
            </button>
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
