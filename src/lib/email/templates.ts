/**
 * Every email Maple sends, as data for the shared layout.
 *
 * Two families:
 *  - App emails: rendered at send time with real values (escaped here).
 *  - Supabase Auth templates: rendered once by scripts/build-email-templates.ts
 *    into docs/email-templates/*.html with Go-template placeholders
 *    ({{ .ConfirmationURL }} etc.) left intact, then pasted into the dashboard.
 *
 * No `@/` imports: this file also runs under plain Node from scripts/.
 */

import { esc, renderEmail, strong, type EmailContent } from './layout.ts'

export const INVITE_TTL_DAYS = 7

// ─── App emails ─────────────────────────────────────────────────────────────

export function householdInviteEmail(p: {
  householdName: string
  memberName: string
  inviterName: string | null
  inviteUrl: string
}) {
  const who = p.inviterName ? `${strong(p.inviterName)} has invited you` : 'You have been invited'
  const content: EmailContent = {
    subject: `Join ${p.householdName} on Maple`,
    preheader: `${p.inviterName ?? 'Someone'} invited you to ${p.householdName}. Your link is inside.`,
    eyebrow: 'Household invitation',
    title: `Join ${p.householdName}`,
    intro: [
      `${who} to track money together in ${strong(p.householdName)}, as ${strong(p.memberName)}.`,
      `Your own accounts stay private. The household sees only joint accounts and the transactions you choose to share.`,
    ],
    button: { label: 'Accept and join', url: p.inviteUrl },
    note: `This link works once and expires in ${INVITE_TTL_DAYS} days. If you weren’t expecting it, you can ignore this email - nothing happens until you accept.`,
  }
  return renderEmail(content)
}

// ─── Supabase Auth templates (Go-template placeholders) ─────────────────────

/** Placeholders Supabase substitutes. Raw on purpose - never escaped. */
const V = {
  url: '{{ .ConfirmationURL }}',
  token: '{{ .Token }}',
  email: '{{ .Email }}',
  newEmail: '{{ .NewEmail }}',
  siteUrl: '{{ .SiteURL }}',
} as const

export type SupabaseTemplate = {
  /** Dashboard template name (Authentication → Emails → Templates). */
  name: 'Confirm signup' | 'Invite user' | 'Magic Link' | 'Change Email Address' | 'Reset Password'
  /** docs/email-templates/<file>.html */
  file: string
  subject: string
  html: string
}

function tpl(name: SupabaseTemplate['name'], file: string, content: EmailContent): SupabaseTemplate {
  return { name, file, subject: content.subject, html: renderEmail(content).html }
}

export function supabaseTemplates(): SupabaseTemplate[] {
  return [
    tpl('Confirm signup', 'confirm-signup', {
      subject: 'Confirm your email - Maple',
      preheader: 'Confirm your email to start using Maple. Your link and 6-digit code are inside.',
      eyebrow: 'Account setup',
      title: 'Welcome to Maple',
      intro: [
        `One last step before you can start budgeting. Confirm that <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.email}</span> belongs to you, and your household is ready to go.`,
      ],
      button: { label: 'Confirm my email', url: V.url },
      code: { lead: 'If the button doesn’t work, enter this code:', value: V.token },
      note: 'Didn’t create a Maple account? You can safely ignore this email - no account will be created without confirmation.',
    }),
    tpl('Magic Link', 'magic-link', {
      subject: 'Your sign-in link - Maple',
      preheader: 'Tap to sign in to Maple. The link works once.',
      eyebrow: 'Sign in',
      title: 'Here’s your sign-in link',
      intro: [
        `Use the button below to sign in as <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.email}</span>. No password needed.`,
      ],
      button: { label: 'Sign in to Maple', url: V.url },
      code: { lead: 'Or enter this code in the app:', value: V.token },
      note: 'Didn’t ask for a sign-in link? Ignore this email - the link only works for whoever holds it, so don’t forward it.',
    }),
    tpl('Reset Password', 'reset-password', {
      subject: 'Reset your password - Maple',
      preheader: 'Choose a new password for your Maple account.',
      eyebrow: 'Password reset',
      title: 'Reset your password',
      intro: [
        `We got a request to reset the password for <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.email}</span>. Tap below to choose a new one.`,
      ],
      button: { label: 'Choose a new password', url: V.url },
      code: { lead: 'Or enter this code in the app:', value: V.token },
      note: 'Didn’t request a reset? Your password hasn’t changed - you can ignore this email.',
    }),
    tpl('Change Email Address', 'change-email', {
      subject: 'Confirm your new email - Maple',
      preheader: 'Confirm the change to your Maple sign-in email.',
      eyebrow: 'Email change',
      title: 'Confirm your new email',
      intro: [
        `You asked to change your Maple sign-in email from <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.email}</span> to <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.newEmail}</span>. Confirm to finish.`,
      ],
      button: { label: 'Confirm new email', url: V.url },
      code: { lead: 'Or enter this code in the app:', value: V.token },
      note: 'Didn’t request this? Ignore this email and your sign-in email stays as it is.',
    }),
    tpl('Invite user', 'invite-user', {
      subject: 'You’ve been invited to Maple',
      preheader: 'Someone invited you to their Maple household.',
      eyebrow: 'Household invitation',
      title: 'You’ve been invited',
      intro: [
        `Someone has invited <span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${V.email}</span> to join their household on Maple. Accept to set up your login and see what’s shared with you.`,
      ],
      button: { label: 'Accept invitation', url: V.url },
      note: `This link expires in ${INVITE_TTL_DAYS} days. If you weren’t expecting it, you can ignore this email.`,
    }),
  ]
}

// Re-export for callers that only need escaping.
export { esc }
