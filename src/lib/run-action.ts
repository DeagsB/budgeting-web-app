'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { useToast } from '@/components/ui/toast'

/**
 * Offline-aware wrapper for calling Server Actions from the client.
 *
 * `runAction` runs `fn`; if the device is offline (or the call dies with a
 * network-level failure) it surfaces a friendly message through `onError`
 * instead of an unhandled rejection, and re-runs the most recent failed action
 * exactly once when the browser fires `online`. Non-network errors are rethrown
 * untouched so callers keep their normal error handling.
 */

export const OFFLINE_MESSAGE = "You're offline. We'll retry when you're back."

export type RunActionOptions<T> = {
  /** Shown when the call fails because the device is offline. */
  offlineMessage?: string
  /** Receives the user-facing message for offline / retry failures. */
  onError?: (message: string) => void
  /** Called with the result when the deferred retry succeeds after reconnect. */
  onRetrySuccess?: (result: T) => void
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message
  return typeof err === 'string' ? err : ''
}

/** Network-level failure: offline, or fetch could not reach the server. */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const msg = errorText(err)
  if (/failed to fetch|load failed|network ?error|fetch failed|networkerror/i.test(msg)) return true
  // fetch() rejects with a bare TypeError on connection failure. Exclude
  // messages that read like a programming error so real bugs still surface.
  if (err instanceof TypeError) {
    return !/cannot read|is not a function|is not defined|of undefined|of null|not iterable/i.test(msg)
  }
  return false
}

// ─── Retry-on-reconnect ─────────────────────────────────────────────────────
// Only the most recent failed action is kept; a burst of failures while offline
// should not replay a queue of stale writes when the connection returns.

let pendingRetry: (() => void) | null = null
let listening = false

function ensureOnlineListener() {
  if (listening || typeof window === 'undefined') return
  listening = true
  window.addEventListener('online', () => {
    const retry = pendingRetry
    pendingRetry = null
    retry?.()
  })
}

function scheduleRetry(retry: () => void) {
  ensureOnlineListener()
  pendingRetry = retry
}

export async function runAction<T>(
  fn: () => Promise<T>,
  opts: RunActionOptions<T> = {},
): Promise<T | undefined> {
  const message = opts.offlineMessage ?? OFFLINE_MESSAGE
  // A fresh attempt supersedes anything queued from an earlier failure, so a
  // user who resubmits after reconnecting never gets a duplicate replay.
  pendingRetry = null

  const deferForReconnect = () => {
    opts.onError?.(message)
    scheduleRetry(async () => {
      try {
        const result = await fn()
        opts.onRetrySuccess?.(result)
      } catch (err) {
        opts.onError?.(isNetworkError(err) ? message : errorText(err) || 'Something went wrong.')
      }
    })
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    deferForReconnect()
    return undefined
  }

  try {
    return await fn()
  } catch (err) {
    if (isNetworkError(err)) {
      deferForReconnect()
      return undefined
    }
    throw err
  }
}

// ─── Hooks ──────────────────────────────────────────────────────────────────

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Live `navigator.onLine`; always `true` during SSR so hydration matches. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

/**
 * `runAction` pre-wired to the toast stack: offline and retry failures show as
 * an ink toast, and a successful retry shows a leaf toast.
 */
export function useRunAction() {
  const { toast } = useToast()
  return useCallback(
    <T,>(fn: () => Promise<T>, opts: RunActionOptions<T> & { retrySuccessMessage?: string } = {}) =>
      runAction(fn, {
        ...opts,
        onError: (msg) => {
          toast({ title: msg, tone: 'ink' })
          opts.onError?.(msg)
        },
        onRetrySuccess: (result) => {
          toast({ title: opts.retrySuccessMessage ?? 'Back online - saved.', tone: 'leaf' })
          opts.onRetrySuccess?.(result)
        },
      }),
    [toast],
  )
}
