import { describe, it, expect } from 'vitest'
import {
  OAUTH_ITEM_KEY,
  OAUTH_MODE_KEY,
  OAUTH_RETURN_KEY,
  OAUTH_TOKEN_KEY,
  clearOAuthState,
  isOAuthReturn,
  persistOAuthState,
  readOAuthResume,
} from './plaid-oauth'

function memStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  }
}

describe('isOAuthReturn', () => {
  it('detects the Plaid oauth_state_id query param', () => {
    expect(isOAuthReturn('?oauth_state_id=abc')).toBe(true)
    expect(isOAuthReturn('?foo=1&oauth_state_id=abc')).toBe(true)
    expect(isOAuthReturn('')).toBe(false)
    expect(isOAuthReturn('?foo=1')).toBe(false)
  })
})

describe('readOAuthResume', () => {
  it('is null when not returning from OAuth, even with a stored token', () => {
    const s = memStorage({ [OAUTH_TOKEN_KEY]: 'tok' })
    expect(readOAuthResume('', s, '/x')).toBeNull()
  })
  it('is null when returning without a stored token', () => {
    expect(readOAuthResume('?oauth_state_id=1', memStorage(), '/x')).toBeNull()
  })
  it('is null when storage is unavailable', () => {
    expect(readOAuthResume('?oauth_state_id=1', null, '/x')).toBeNull()
  })
  it('defaults mode to connect and returnTo to the fallback', () => {
    const s = memStorage({ [OAUTH_TOKEN_KEY]: 'tok' })
    expect(readOAuthResume('?oauth_state_id=1', s, '/onboarding/bank')).toEqual({
      token: 'tok',
      mode: 'connect',
      itemId: null,
      returnTo: '/onboarding/bank',
    })
  })
  it('reads update mode with its item id', () => {
    const s = memStorage({
      [OAUTH_TOKEN_KEY]: 'tok',
      [OAUTH_MODE_KEY]: 'update',
      [OAUTH_ITEM_KEY]: 'item-1',
      [OAUTH_RETURN_KEY]: '/transactions/import/plaid-setup',
    })
    expect(readOAuthResume('?oauth_state_id=1', s, '/x')).toEqual({
      token: 'tok',
      mode: 'update',
      itemId: 'item-1',
      returnTo: '/transactions/import/plaid-setup',
    })
  })
  it('rejects an unsafe stored returnTo (open redirect guard)', () => {
    const s = memStorage({ [OAUTH_TOKEN_KEY]: 'tok', [OAUTH_RETURN_KEY]: 'https://evil.example' })
    expect(readOAuthResume('?oauth_state_id=1', s, '/safe')?.returnTo).toBe('/safe')
    const s2 = memStorage({ [OAUTH_TOKEN_KEY]: 'tok', [OAUTH_RETURN_KEY]: '//evil.example' })
    expect(readOAuthResume('?oauth_state_id=1', s2, '/safe')?.returnTo).toBe('/safe')
  })
})

describe('persistOAuthState / clearOAuthState', () => {
  it('round-trips connect state and drops a stale item id', () => {
    const s = memStorage({ [OAUTH_ITEM_KEY]: 'stale' })
    persistOAuthState(s, { token: 't', mode: 'connect', returnTo: '/onboarding/bank' })
    expect(s.dump()).toEqual({
      [OAUTH_TOKEN_KEY]: 't',
      [OAUTH_MODE_KEY]: 'connect',
      [OAUTH_RETURN_KEY]: '/onboarding/bank',
    })
  })
  it('round-trips update state', () => {
    const s = memStorage()
    persistOAuthState(s, { token: 't', mode: 'update', itemId: 'i', returnTo: '/p' })
    expect(readOAuthResume('?oauth_state_id=1', s, '/x')).toEqual({ token: 't', mode: 'update', itemId: 'i', returnTo: '/p' })
  })
  it('clears every key', () => {
    const s = memStorage()
    persistOAuthState(s, { token: 't', mode: 'update', itemId: 'i', returnTo: '/p' })
    clearOAuthState(s)
    expect(s.dump()).toEqual({})
  })
  it('tolerates a null storage', () => {
    expect(() => persistOAuthState(null, { token: 't', mode: 'connect', returnTo: '/' })).not.toThrow()
    expect(() => clearOAuthState(null)).not.toThrow()
  })
})
