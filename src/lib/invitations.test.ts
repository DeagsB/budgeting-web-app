import { describe, expect, it } from 'vitest'
import {
  acceptErrorMessage,
  confirmRedirectFor,
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
  inviteUrl,
  inviteTokenFromNext,
  invitationStatus,
  safeNextPath,
} from './invitations'

describe('tokens', () => {
  it('generates 32 random bytes, url-safe, unique', () => {
    const a = generateInviteToken()
    const b = generateInviteToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })

  it('hashes with sha256 hex (matches Postgres digest(convert_to(raw,UTF8),sha256))', () => {
    expect(hashInviteToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashInviteToken('abc')).toBe(hashInviteToken('abc'))
  })

  it('expiry is 7 days out', () => {
    const now = new Date('2026-08-26T00:00:00Z')
    expect(inviteExpiry(now).toISOString()).toBe('2026-09-02T00:00:00.000Z')
  })
})

describe('invitationStatus', () => {
  const base = { accepted_at: null, revoked_at: null, expires_at: '2026-09-02T00:00:00Z' }
  const now = new Date('2026-08-26T00:00:00Z')
  it('pending / accepted / revoked / expired precedence', () => {
    expect(invitationStatus(base, now)).toBe('pending')
    expect(invitationStatus({ ...base, accepted_at: '2026-08-27T00:00:00Z' }, now)).toBe('accepted')
    expect(invitationStatus({ ...base, revoked_at: '2026-08-27T00:00:00Z' }, now)).toBe('revoked')
    expect(invitationStatus({ ...base, expires_at: '2026-08-25T00:00:00Z' }, now)).toBe('expired')
    expect(invitationStatus({ ...base, accepted_at: '2026-08-27T00:00:00Z', revoked_at: '2026-08-28T00:00:00Z' }, now)).toBe('accepted')
  })
})

describe('urls', () => {
  it('builds invite + confirm redirect without double slashes', () => {
    expect(inviteUrl('https://app.example/', 'tok')).toBe('https://app.example/invite/tok')
    expect(confirmRedirectFor('https://app.example', 'tok')).toBe('https://app.example/auth/confirm?next=%2Finvite%2Ftok')
  })
})

describe('safeNextPath', () => {
  it('accepts plain same-origin paths', () => {
    expect(safeNextPath('/invite/abc')).toBe('/invite/abc')
    expect(safeNextPath('/dashboard?x=1')).toBe('/dashboard?x=1')
  })
  it('rejects open-redirect shapes', () => {
    expect(safeNextPath('//evil.com')).toBe('/dashboard')
    expect(safeNextPath('/\\evil.com')).toBe('/dashboard')
    expect(safeNextPath('https://evil.com')).toBe('/dashboard')
    expect(safeNextPath('/javascript:alert(1)')).toBe('/dashboard')
    expect(safeNextPath('/x\r\nLocation: y')).toBe('/dashboard')
    expect(safeNextPath('')).toBe('/dashboard')
    expect(safeNextPath(null)).toBe('/dashboard')
    expect(safeNextPath(undefined, '/onboarding')).toBe('/onboarding')
  })
})

describe('acceptErrorMessage', () => {
  it('strips Postgres prefixes and maps known codes', () => {
    expect(acceptErrorMessage('email_mismatch')).toMatch(/different email/)
    expect(acceptErrorMessage('P0001: expired')).toMatch(/expired/)
    expect(acceptErrorMessage('something else')).toBe('Could not accept the invitation.')
  })
})

describe('inviteTokenFromNext', () => {
  it('pulls the token out of an invite path', () => {
    expect(inviteTokenFromNext('/invite/lWngzzWxYdUYTrUoODNoUngEtBU30SkXEbsPoaGuAPw')).toBe(
      'lWngzzWxYdUYTrUoODNoUngEtBU30SkXEbsPoaGuAPw',
    )
    expect(inviteTokenFromNext('/invite/lWngzzWxYdUYTrUoODNoUngEtBU30SkXEbsPoaGuAPw/')).toBe(
      'lWngzzWxYdUYTrUoODNoUngEtBU30SkXEbsPoaGuAPw',
    )
  })
  it('is null for anything else', () => {
    expect(inviteTokenFromNext('/dashboard')).toBeNull()
    expect(inviteTokenFromNext('')).toBeNull()
    expect(inviteTokenFromNext(null)).toBeNull()
    expect(inviteTokenFromNext('/invite/short')).toBeNull()
    expect(inviteTokenFromNext('/invite/tok en/with space')).toBeNull()
  })
  it('refuses an off-origin next that only looks like an invite', () => {
    expect(inviteTokenFromNext('//evil.example/invite/aaaaaaaaaaaaaaaaaaaa')).toBeNull()
    expect(inviteTokenFromNext('https://evil.example/invite/aaaaaaaaaaaaaaaaaaaa')).toBeNull()
  })
})
