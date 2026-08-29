'use client'

/**
 * Small non-blocking pill shown when a new service worker is installed and
 * waiting. Sits just above the mobile tab bar and clears the iOS home
 * indicator. Tapping "Reload" tells the waiting worker to take over; the
 * registrar reloads the page once it becomes the controller.
 */
export function UpdateToast({ onReload, busy }: { onReload: () => void; busy: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="maple-chrome fixed inset-x-0 z-50 px-3"
      style={{ bottom: 'calc(var(--maple-tabbar-h) + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div
        className="mx-auto flex h-11 max-w-[420px] items-center justify-between gap-3 rounded-full pl-4 pr-1.5 shadow-[var(--shadow-float)]"
        style={{ background: 'var(--color-leaf)', color: 'var(--color-paper)' }}
      >
        <span className="text-[14px] font-medium tracking-[-0.01em]">Update ready</span>
        <button
          type="button"
          onClick={onReload}
          disabled={busy}
          className="flex h-9 min-w-[44px] items-center justify-center rounded-full px-4 text-[14px] font-semibold disabled:opacity-60"
          style={{ background: 'var(--color-paper)', color: 'var(--color-leaf)' }}
        >
          {busy ? 'Reloading' : 'Reload'}
        </button>
      </div>
    </div>
  )
}
