'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { inviteMember, type InviteState } from './invite-actions'

/**
 * Bottom sheet that invites an email to take over a member slot. After a
 * successful submit it shows the link (copyable) whether or not the email
 * went out, because Supabase's built-in mailer only reaches team addresses
 * until custom SMTP is configured.
 */
export function InviteSheet({
  open,
  onClose,
  member,
}: {
  open: boolean
  onClose: () => void
  member: { id: string; name: string } | null
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<InviteState, FormData>(inviteMember, undefined)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (state && 'ok' in state) router.refresh()
  }, [state, router])

  const done = state && 'ok' in state

  return (
    <Sheet open={open} onClose={onClose} title={member ? `Invite ${member.name}` : 'Invite'}>
      {!member ? null : done ? (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-[14px] leading-relaxed text-ink-2">
            {state.emailSent
              ? `An email is on its way. You can also share this link directly - it works once and expires in 7 days.`
              : `We could not send the email${state.emailError ? ` (${state.emailError})` : ''}. Share this link instead - it works once and expires in 7 days.`}
          </p>
          <div className="flex flex-col gap-2">
            <input
              readOnly
              value={state.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invitation link"
              className="maple-input font-mono text-[13px]"
            />
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.inviteUrl)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                } catch {
                  /* clipboard blocked: the field is selectable */
                }
              }}
            >
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4 pb-2">
          <input type="hidden" name="member_id" value={member.id} />
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            They will sign in with their own email and see only their accounts plus anything marked shared.
          </p>
          <Field label="Email" required>
            <input
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              className="maple-input"
              placeholder="partner@domain.ca"
              autoFocus
            />
          </Field>
          <Field label="Access" hint="Admins can invite and remove other members.">
            <select name="role" className="maple-select" defaultValue="member">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
          {state && 'error' in state && (
            <p
              role="alert"
              className="rounded-[12px] px-3 py-2 text-[13px] font-medium"
              style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
            >
              {state.error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Sending…' : 'Send invitation'}
          </Button>
        </form>
      )}
    </Sheet>
  )
}
