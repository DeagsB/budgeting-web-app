/**
 * Plaid Link OAuth resume state (pure, browser-agnostic).
 *
 * OAuth banks (RBC, TD, Scotia...) bounce the browser to the bank's own site
 * and back to PLAID_REDIRECT_URI. The page fully unloads, so the link_token,
 * the mode (fresh connect vs re-auth of an existing item) and where to go
 * afterwards must survive in localStorage. Link then reads `oauth_state_id`
 * off the return URL to resume the in-flight session.
 */

import { safeNextPath } from '@/lib/invitations'

export const OAUTH_TOKEN_KEY = 'maple.plaid.linkToken'
export const OAUTH_MODE_KEY = 'maple.plaid.mode'
export const OAUTH_ITEM_KEY = 'maple.plaid.updateItem'
export const OAUTH_RETURN_KEY = 'maple.plaid.returnTo'

export type PlaidLinkMode = 'connect' | 'update'

export type OAuthResume = {
  token: string
  mode: PlaidLinkMode
  /** plaid_items.id being re-authenticated (update mode only). */
  itemId: string | null
  /** In-app path to land on once Link finishes. */
  returnTo: string
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function isOAuthReturn(search: string): boolean {
  return search.includes('oauth_state_id')
}

/** Null unless the URL carries oauth_state_id AND a token was persisted before the bounce. */
export function readOAuthResume(
  search: string,
  storage: StorageLike | null,
  fallbackReturnTo: string,
): OAuthResume | null {
  if (!isOAuthReturn(search) || !storage) return null
  try {
    const token = storage.getItem(OAUTH_TOKEN_KEY)
    if (!token) return null
    return {
      token,
      mode: storage.getItem(OAUTH_MODE_KEY) === 'update' ? 'update' : 'connect',
      itemId: storage.getItem(OAUTH_ITEM_KEY),
      returnTo: safeNextPath(storage.getItem(OAUTH_RETURN_KEY), fallbackReturnTo),
    }
  } catch {
    return null /* storage unavailable */
  }
}

export function persistOAuthState(
  storage: StorageLike | null,
  s: { token: string; mode: PlaidLinkMode; itemId?: string | null; returnTo: string },
): void {
  if (!storage) return
  try {
    storage.setItem(OAUTH_TOKEN_KEY, s.token)
    storage.setItem(OAUTH_MODE_KEY, s.mode)
    if (s.itemId) storage.setItem(OAUTH_ITEM_KEY, s.itemId)
    else storage.removeItem(OAUTH_ITEM_KEY)
    storage.setItem(OAUTH_RETURN_KEY, s.returnTo)
  } catch {
    /* private mode / storage disabled - non-OAuth banks still work */
  }
}

export function clearOAuthState(storage: StorageLike | null): void {
  if (!storage) return
  try {
    storage.removeItem(OAUTH_TOKEN_KEY)
    storage.removeItem(OAUTH_MODE_KEY)
    storage.removeItem(OAUTH_ITEM_KEY)
    storage.removeItem(OAUTH_RETURN_KEY)
  } catch {
    /* nothing to clean */
  }
}
