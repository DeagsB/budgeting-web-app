import { describe, expect, it } from 'vitest'
import { plaidAttentionAction, plaidAttentionKind, plaidAttentionTitle } from './plaid-attention'

describe('plaidAttentionKind', () => {
  it('asks for a reconnect whenever the bank dropped the connection', () => {
    for (const status of ['login_required', 'pending_disconnect', 'revoked', 'error']) {
      expect(plaidAttentionKind({ status }, 3)).toBe('reconnect')
      // Reconnect first even when nothing is mapped: the sign-in has to work
      // before an account picker can list anything.
      expect(plaidAttentionKind({ status }, 0)).toBe('reconnect')
    }
  })

  it('asks the user to choose accounts for an active bank with nothing mapped', () => {
    // The production state: CIBC linked, cursor advancing, zero accounts,
    // zero transactions, and nothing on screen said why.
    expect(plaidAttentionKind({ status: 'active' }, 0)).toBe('choose_accounts')
  })

  it('is quiet for a healthy, mapped bank and for a removed one', () => {
    expect(plaidAttentionKind({ status: 'active' }, 2)).toBeNull()
    expect(plaidAttentionKind({ status: 'removed' }, 0)).toBeNull()
  })
})

describe('copy and action', () => {
  it('names the fix in the title and the button', () => {
    const choose = { id: 'i1', kind: 'choose_accounts' as const, status: 'active' }
    expect(plaidAttentionTitle(choose)).toBe('is linked but no accounts are tracked yet')
    expect(plaidAttentionAction(choose)).toEqual({ label: 'Choose accounts', href: '/transactions/import/plaid-setup' })

    const reconnect = { id: 'i2', kind: 'reconnect' as const, status: 'login_required' }
    expect(plaidAttentionTitle(reconnect)).toBe('needs you to sign in again')
    expect(plaidAttentionAction(reconnect)).toEqual({ label: 'Reconnect', href: '/transactions/import/plaid-setup?reauth=i2' })
  })
})
