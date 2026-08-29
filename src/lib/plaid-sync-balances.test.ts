import { describe, expect, it } from 'vitest'
import {
  BALANCE_REFRESH_MIN_MS,
  consentExpiringSoon,
  logStatusFor,
  shouldRefreshBalancesLive,
  statusFromItemError,
} from './plaid-sync-plan'

const NOW = Date.parse('2026-08-29T12:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

describe('shouldRefreshBalancesLive', () => {
  it('makes the live call when accounts are mapped, the pages carried no balances, and nothing was refreshed recently', () => {
    expect(shouldRefreshBalancesLive(3, 0, null, NOW)).toBe(true)
    expect(shouldRefreshBalancesLive(3, 0, iso(BALANCE_REFRESH_MIN_MS + 1000), NOW)).toBe(true)
  })

  it('never makes the live call for a bank with no accounts chosen', () => {
    // The production loop: nothing mapped, every sync fell through to
    // /accounts/balance/get, CIBC demanded a fresh login, the ITEM: ERROR
    // webhook flipped the item back to login_required one second later.
    expect(shouldRefreshBalancesLive(0, 0, null, NOW)).toBe(false)
  })

  it('skips the live call once the sync pages already wrote balances', () => {
    expect(shouldRefreshBalancesLive(3, 3, null, NOW)).toBe(false)
  })

  it('throttles the live call to about one per day per item', () => {
    expect(shouldRefreshBalancesLive(3, 0, iso(60 * 60 * 1000), NOW)).toBe(false)
    expect(shouldRefreshBalancesLive(3, 0, iso(BALANCE_REFRESH_MIN_MS - 1), NOW)).toBe(false)
  })

  it('treats an unparseable timestamp as never refreshed', () => {
    expect(shouldRefreshBalancesLive(3, 0, 'garbage', NOW)).toBe(true)
  })
})

describe('statusFromItemError', () => {
  it('reads a healthy item as active', () => {
    expect(statusFromItemError(null)).toBe('active')
    expect(statusFromItemError(undefined)).toBe('active')
  })

  it('maps every sign-in problem to login_required and the pending case to its own status', () => {
    for (const code of ['ITEM_LOGIN_REQUIRED', 'INVALID_CREDENTIALS', 'INVALID_MFA', 'ITEM_LOCKED', 'USER_SETUP_REQUIRED']) {
      expect(statusFromItemError(code)).toBe('login_required')
    }
    expect(statusFromItemError('PENDING_DISCONNECT')).toBe('pending_disconnect')
  })

  it('maps a revoked connection and leaves transient institution trouble alone', () => {
    expect(statusFromItemError('USER_PERMISSION_REVOKED')).toBe('revoked')
    expect(statusFromItemError('ITEM_NOT_FOUND')).toBe('revoked')
    expect(statusFromItemError('INSTITUTION_DOWN')).toBe('active')
    expect(statusFromItemError('PRODUCT_NOT_READY')).toBe('active')
  })

  it('treats anything unknown as a hard error, never as healthy', () => {
    expect(statusFromItemError('SOMETHING_NEW')).toBe('error')
  })
})

describe('logStatusFor', () => {
  it('folds item statuses onto the constrained log statuses', () => {
    expect(logStatusFor('active')).toBe('ok')
    expect(logStatusFor('login_required')).toBe('login_required')
    expect(logStatusFor('pending_disconnect')).toBe('login_required')
    expect(logStatusFor('revoked')).toBe('revoked')
    expect(logStatusFor('error')).toBe('error')
  })
})

describe('consentExpiringSoon', () => {
  it('flags consent that ends within a week, not later', () => {
    expect(consentExpiringSoon(new Date(NOW + 2 * 24 * 3600 * 1000).toISOString(), NOW)).toBe(true)
    expect(consentExpiringSoon(new Date(NOW + 30 * 24 * 3600 * 1000).toISOString(), NOW)).toBe(false)
    expect(consentExpiringSoon(null, NOW)).toBe(false)
  })
})
