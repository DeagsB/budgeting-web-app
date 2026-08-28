import { describe, expect, it } from 'vitest'
import { isExistingAccountSignUp } from './auth-signals'

describe('isExistingAccountSignUp', () => {
  it('flags the obfuscated user Supabase returns for an already-registered address', () => {
    expect(isExistingAccountSignUp({ identities: [] })).toBe(true)
  })

  it('does not flag a genuine new sign-up (identities populated)', () => {
    expect(isExistingAccountSignUp({ identities: [{ id: 'x' }] })).toBe(false)
  })

  it('does not flag a missing user or missing identities field', () => {
    expect(isExistingAccountSignUp(null)).toBe(false)
    expect(isExistingAccountSignUp(undefined)).toBe(false)
    expect(isExistingAccountSignUp({})).toBe(false)
    expect(isExistingAccountSignUp({ identities: null })).toBe(false)
  })
})
