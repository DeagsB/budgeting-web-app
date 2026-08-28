import { describe, expect, it } from 'vitest'
import { buildAuthEmails, confirmLink, type SendEmailHookPayload } from './auth-email'

const base = (over: Partial<SendEmailHookPayload['email_data']> = {}, user: SendEmailHookPayload['user'] = { email: 'jane@example.ca' }): SendEmailHookPayload => ({
  user,
  email_data: {
    token: '123456',
    token_hash: 'abc123',
    redirect_to: 'https://app.test/auth/confirm',
    email_action_type: 'signup',
    site_url: 'https://app.test',
    token_new: '',
    token_hash_new: '',
    ...over,
  },
})

describe('confirmLink', () => {
  it('appends token_hash and type to the app redirect', () => {
    expect(confirmLink('https://app.test/auth/confirm?next=%2Finvite%2Fx', 'https://app.test', 'h1', 'signup')).toBe(
      'https://app.test/auth/confirm?next=%2Finvite%2Fx&token_hash=h1&type=signup',
    )
  })

  it('falls back to <site>/auth/confirm when redirect_to is empty or not the confirm route', () => {
    expect(confirmLink('', 'https://app.test/', 'h1', 'recovery')).toBe('https://app.test/auth/confirm?token_hash=h1&type=recovery')
    expect(confirmLink('https://app.test/somewhere', 'https://app.test', 'h1', 'recovery')).toBe(
      'https://app.test/auth/confirm?token_hash=h1&type=recovery',
    )
  })
})

describe('buildAuthEmails', () => {
  it('renders the signup email with a direct confirm link and the code', () => {
    const r = buildAuthEmails(base())
    if ('error' in r) throw new Error(r.error)
    expect(r.emails).toHaveLength(1)
    const [e] = r.emails
    expect(e.to).toBe('jane@example.ca')
    expect(e.subject).toBe('Confirm your email - Maple')
    expect(e.html).toContain('https://app.test/auth/confirm?token_hash=abc123&type=signup')
    expect(e.html).not.toContain('supabase.co')
    expect(e.text).toContain('123456')
  })

  it('uses the reset template for recovery and keeps the app next path', () => {
    const r = buildAuthEmails(base({ email_action_type: 'recovery', redirect_to: 'https://app.test/auth/confirm?next=%2Freset-password' }))
    if ('error' in r) throw new Error(r.error)
    expect(r.emails[0].subject).toBe('Reset your password - Maple')
    expect(r.emails[0].text).toContain('https://app.test/auth/confirm?next=%2Freset-password&token_hash=abc123&type=recovery')
  })

  it('sends two emails for a secure email change', () => {
    const r = buildAuthEmails(
      base(
        { email_action_type: 'email_change', token_hash_new: 'newhash', token_new: '654321' },
        { email: 'old@example.ca', new_email: 'new@example.ca' },
      ),
    )
    if ('error' in r) throw new Error(r.error)
    expect(r.emails.map((e) => e.to)).toEqual(['old@example.ca', 'new@example.ca'])
    expect(r.emails[1].html).toContain('token_hash=newhash')
    expect(r.emails[1].text).toContain('654321')
  })

  it('escapes the address it interpolates into HTML', () => {
    const r = buildAuthEmails(base({}, { email: 'x<script>@example.ca' }))
    if ('error' in r) throw new Error(r.error)
    expect(r.emails[0].html).not.toContain('<script>')
  })

  it('refuses unknown action types and missing recipients', () => {
    expect(buildAuthEmails(base({ email_action_type: 'reauthentication' }))).toEqual({
      error: 'Unsupported email_action_type "reauthentication".',
    })
    expect(buildAuthEmails(base({}, { email: '' }))).toEqual({ error: 'Payload has no recipient email.' })
  })
})
