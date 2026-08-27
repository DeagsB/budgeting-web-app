import { describe, it, expect } from 'vitest'
import { esc, renderEmail, strong } from './layout'
import { householdInviteEmail, supabaseTemplates } from './templates'

describe('layout', () => {
  it('escapes untrusted text', () => {
    expect(esc(`<b>"Tom" & 'Jerry'</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; &#39;Jerry&#39;&lt;/b&gt;')
    expect(strong('<x>')).toContain('&lt;x&gt;')
  })

  it('renders title, button, fallback link, note and a text part', () => {
    const r = renderEmail({
      subject: 'Sub',
      preheader: 'Pre',
      eyebrow: 'Eye',
      title: 'Hello <there>',
      intro: ['First', 'Second'],
      button: { label: 'Go', url: 'https://x.test/a?b=1&c=2' },
      note: 'Note here',
    })
    expect(r.subject).toBe('Sub')
    expect(r.html).toContain('Hello &lt;there&gt;')
    expect(r.html).toContain('href="https://x.test/a?b=1&c=2"')
    expect(r.html).toContain('>Go</a>')
    expect(r.html).toContain('Or paste this link into your browser')
    expect(r.html).toContain('Note here')
    expect(r.html).not.toContain('{{')
    expect(r.text).toContain('HELLO <THERE>')
    expect(r.text).toContain('Go: https://x.test/a?b=1&c=2')
    expect(r.text).toContain('Note here')
  })

  it('omits button and code blocks when absent', () => {
    const r = renderEmail({ subject: 's', preheader: 'p', eyebrow: 'e', title: 't', intro: [], note: 'n' })
    expect(r.html).not.toContain('v:roundrect')
    expect(r.html).not.toContain('Courier New')
    expect(r.html).not.toContain('Or paste this link')
  })
})

describe('householdInviteEmail', () => {
  it('names the household and inviter, and escapes them', () => {
    const r = householdInviteEmail({
      householdName: 'Smith & Co',
      inviterName: '<Robin>',
      inviteUrl: 'https://app.test/invite/tok',
    })
    expect(r.subject).toBe('Join Smith & Co on Maple')
    expect(r.html).toContain('Smith &amp; Co')
    expect(r.html).toContain('&lt;Robin&gt;')
    expect(r.html).toContain('href="https://app.test/invite/tok"')
    expect(r.text).toContain('Accept and join: https://app.test/invite/tok')
  })
  it('falls back to a neutral line without an inviter name', () => {
    const r = householdInviteEmail({ householdName: 'H', inviterName: null, inviteUrl: 'https://a.test/x' })
    expect(r.html).toContain('You have been invited')
  })
})

describe('supabaseTemplates', () => {
  it('keeps Go placeholders intact and covers every auth email', () => {
    const all = supabaseTemplates()
    expect(all.map((t) => t.name).sort()).toEqual(
      ['Change Email Address', 'Confirm signup', 'Invite user', 'Magic Link', 'Reset Password'].sort(),
    )
    for (const t of all) {
      expect(t.html).toContain('{{ .ConfirmationURL }}')
      expect(t.html).not.toContain('{{ .ConfirmationURL }}&')
      expect(t.subject.length).toBeGreaterThan(5)
    }
    expect(all.find((t) => t.name === 'Confirm signup')!.html).toContain('{{ .Token }}')
    expect(all.find((t) => t.name === 'Change Email Address')!.html).toContain('{{ .NewEmail }}')
  })
})
