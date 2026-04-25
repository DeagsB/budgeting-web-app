'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerGmailSync, type SyncNowState } from './import/auto-setup/actions'

/**
 * Pill button that fires the Apps Script /exec endpoint to pull any unread
 * bank-alert emails right now. Lives at the top of the Activity page so a
 * user can refresh the feed seconds after a swipe instead of waiting for
 * the hourly trigger.
 *
 * Disabled state when no sync URL is configured — the user is nudged to
 * the auto-setup page where they paste it.
 */
export function SyncNowButton({ hasSyncUrl }: { hasSyncUrl: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [state, setState] = useState<SyncNowState>(undefined)

  function go() {
    setState(undefined)
    start(async () => {
      const res = await triggerGmailSync()
      setState(res)
      if (res && 'ok' in res && res.imported > 0) router.refresh()
    })
  }

  if (!hasSyncUrl) {
    return (
      <a
        href="/transactions/import/auto-setup"
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--color-hair)] bg-[var(--color-paper)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
        title="Set up Gmail auto-import to enable Sync"
      >
        <RefreshIcon />
        Set up sync
      </a>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--color-ink)] transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        <RefreshIcon spinning={pending} />
        {pending ? 'Syncing…' : 'Sync'}
      </button>
      {state && 'ok' in state && state.ok && state.imported === 0 && (
        <span className="text-[11.5px] text-[var(--color-ink-3)]">Up to date.</span>
      )}
      {state && 'ok' in state && state.ok && state.imported > 0 && (
        <span className="text-[11.5px] font-medium text-[var(--color-leaf-deep)]">
          +{state.imported} new
        </span>
      )}
      {state && 'error' in state && (
        <span className="max-w-[180px] truncate text-[11.5px] text-[var(--color-maple)]" title={state.error}>
          {state.error}
        </span>
      )}
    </div>
  )
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={spinning ? 'animate-spin' : ''}
      aria-hidden
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}
