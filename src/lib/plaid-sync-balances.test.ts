import { describe, expect, it } from 'vitest'
import { shouldRefreshBalancesLive } from './plaid-sync-plan'

describe('shouldRefreshBalancesLive', () => {
  it('makes the live call only when accounts are mapped and the pages carried no balances', () => {
    expect(shouldRefreshBalancesLive(3, 0)).toBe(true)
  })

  it('never makes the live call for a bank with no accounts chosen', () => {
    // The production loop: nothing mapped, every sync fell through to
    // /accounts/balance/get, CIBC demanded a fresh login, the ITEM: ERROR
    // webhook flipped the item back to login_required one second later.
    expect(shouldRefreshBalancesLive(0, 0)).toBe(false)
  })

  it('skips the live call once the sync pages already wrote balances', () => {
    expect(shouldRefreshBalancesLive(3, 3)).toBe(false)
    expect(shouldRefreshBalancesLive(1, 1)).toBe(false)
  })
})
