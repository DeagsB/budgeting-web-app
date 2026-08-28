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
      `${who} to track money together in ${strong(p.householdName)}.`,
      `You will create your own login and pick the name the household sees. Your own accounts stay private; the household sees only joint accounts and the transactions you choose to share.`,
    ],
    button: { label: 'Accept and join', url: p.inviteUrl },
    note: `This link works once and expires in ${INVITE_TTL_DAYS} days. If you weren’t expecting it, you can ignore this email - nothing happens until you accept.`,
  }
  return renderEmail(content)
}

// ─── Supabase Auth templates (Go-template placeholders) ─────────────────────

/**
 * The five Supabase Auth emails. One content function per kind, fed either
 * real values (the Send Email hook, src/lib/auth-email.ts) or Go-template
 * placeholders (the dashboard fallback templates below).
 */
export type AuthEmailKind = 'signup' | 'magiclink' | 'recovery' | 'email_change' | 'invite'

export type AuthEmailValues = {
  /** Link the button points at. Already a URL - never escaped. */
  url: string
  /** 6-digit one-time code. */
  token: string
  /** Already-escaped HTML for the recipient's address. */
  email: string
  /** Already-escaped HTML for the new address (email change only). */
  newEmail: string
}

const em = (s: string) => `<span class="dm-ink" style="color: #1e1a17; font-weight: 600;">${s}</span>`

export function authEmailContent(kind: AuthEmailKind, v: AuthEmailValues): EmailContent {
  switch (kind) {
    case 'signup':
      return {
        subject: 'Confirm your email - Maple',
        preheader: 'Confirm your email to start using Maple. Your link and 6-digit code are inside.',
        eyebrow: 'Account setup',
        title: 'Welcome to Maple',
        intro: [
          `One last step before you can start budgeting. Confirm that ${em(v.email)} belongs to you, and your household is ready to go.`,
        ],
        button: { label: 'Confirm my email', url: v.url },
        code: { lead: 'If the button doesn’t work, enter this code:', value: v.token },
        note: 'Didn’t create a Maple account? You can safely ignore this email - no account will be created without confirmation.',
      }
    case 'magiclink':
      return {
        subject: 'Your sign-in link - Maple',
        preheader: 'Tap to sign in to Maple. The link works once.',
        eyebrow: 'Sign in',
        title: 'Here’s your sign-in link',
        intro: [`Use the button below to sign in as ${em(v.email)}. No password needed.`],
        button: { label: 'Sign in to Maple', url: v.url },
        code: { lead: 'Or enter this code in the app:', value: v.token },
        note: 'Didn’t ask for a sign-in link? Ignore this email - the link only works for whoever holds it, so don’t forward it.',
      }
    case 'recovery':
      return {
        subject: 'Reset your password - Maple',
        preheader: 'Choose a new password for your Maple account.',
        eyebrow: 'Password reset',
        title: 'Reset your password',
        intro: [`We got a request to reset the password for ${em(v.email)}. Tap below to choose a new one.`],
        button: { label: 'Choose a new password', url: v.url },
        code: { lead: 'Or enter this code in the app:', value: v.token },
        note: 'Didn’t request a reset? Your password hasn’t changed - you can ignore this email.',
      }
    case 'email_change':
      return {
        subject: 'Confirm your new email - Maple',
        preheader: 'Confirm the change to your Maple sign-in email.',
        eyebrow: 'Email change',
        title: 'Confirm your new email',
        intro: [
          `You asked to change your Maple sign-in email from ${em(v.email)} to ${em(v.newEmail)}. Confirm to finish.`,
        ],
        button: { label: 'Confirm new email', url: v.url },
        code: { lead: 'Or enter this code in the app:', value: v.token },
        note: 'Didn’t request this? Ignore this email and your sign-in email stays as it is.',
      }
    case 'invite':
      return {
        subject: 'You’ve been invited to Maple',
        preheader: 'Someone invited you to their Maple household.',
        eyebrow: 'Household invitation',
        title: 'You’ve been invited',
        intro: [
          `Someone has invited ${em(v.email)} to join their household on Maple. Accept to set up your login and see what’s shared with you.`,
        ],
        button: { label: 'Accept invitation', url: v.url },
        note: `This link expires in ${INVITE_TTL_DAYS} days. If you weren’t expecting it, you can ignore this email.`,
      }
  }
}

/** Placeholders Supabase substitutes in dashboard templates. Raw on purpose - never escaped. */
const V: AuthEmailValues = {
  url: '{{ .ConfirmationURL }}',
  token: '{{ .Token }}',
  email: '{{ .Email }}',
  newEmail: '{{ .NewEmail }}',
}

export type SupabaseTemplate = {
  /** Dashboard template name (Authentication → Emails → Templates). */
  name: 'Confirm signup' | 'Invite user' | 'Magic Link' | 'Change Email Address' | 'Reset Password'
  /** docs/email-templates/<file>.html */
  file: string
  subject: string
  html: string
}

function tpl(name: SupabaseTemplate['name'], file: string, kind: AuthEmailKind): SupabaseTemplate {
  const content = authEmailContent(kind, V)
  return { name, file, subject: content.subject, html: renderEmail(content).html }
}

/**
 * Dashboard fallback templates (used only when the Send Email hook is off).
 * Production sends through the hook instead - see src/lib/auth-email.ts.
 */
export function supabaseTemplates(): SupabaseTemplate[] {
  return [
    tpl('Confirm signup', 'confirm-signup', 'signup'),
    tpl('Magic Link', 'magic-link', 'magiclink'),
    tpl('Reset Password', 'reset-password', 'recovery'),
    tpl('Change Email Address', 'change-email', 'email_change'),
    tpl('Invite user', 'invite-user', 'invite'),
  ]
}

// Re-export for callers that only need escaping.
export { esc }
