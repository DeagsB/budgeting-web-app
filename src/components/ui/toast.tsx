'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/**
 * Minimal toast stack. `useToast().toast({ title, tone, action })` pushes a
 * pill that sits just above the mobile tab bar (bottom-right on desktop),
 * auto-dismisses after 4s (paused while hovered / focused), and respects
 * `prefers-reduced-motion`. Mounted once in the app shell.
 */

export type ToastTone = 'leaf' | 'maple' | 'ink'

export type ToastInput = {
  title: string
  tone?: ToastTone
  action?: { label: string; onClick: () => void }
  /** Auto-dismiss delay in ms. Defaults to 4000. */
  duration?: number
}

type ToastItem = ToastInput & { id: number }

type ToastApi = {
  toast: (input: ToastInput) => number
  dismiss: (id: number) => void
}

const noop: ToastApi = {
  toast: () => {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('useToast() called outside <ToastProvider>; toast dropped.')
    }
    return -1
  },
  dismiss: () => {},
}

const ToastContext = createContext<ToastApi>(noop)

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

const DEFAULT_DURATION = 4000
const MAX_VISIBLE = 3

export function ToastProvider({
  children,
  raised = false,
}: {
  children: ReactNode
  /** Lift the stack (e.g. while the offline banner occupies the slot below). */
  raised?: boolean
}) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setItems((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...input, id }])
    return id
  }, [])

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className={
          'maple-chrome pointer-events-none fixed left-3 right-[84px] z-[70] flex flex-col items-stretch gap-2 md:left-auto md:right-6 md:w-[360px] ' +
          (raised
            ? 'bottom-[calc(72px+env(safe-area-inset-bottom)+64px)] md:bottom-[68px]'
            : 'bottom-[calc(72px+env(safe-area-inset-bottom)+12px)] md:bottom-4')
        }
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const TONE_CLASS: Record<ToastTone, string> = {
  leaf: 'bg-leaf text-paper',
  maple: 'bg-maple text-paper',
  ink: 'bg-ink text-paper',
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const [shown, setShown] = useState(false)
  const [paused, setPaused] = useState(false)
  const duration = item.duration ?? DEFAULT_DURATION

  // Enter transition: mount hidden, flip to visible on the next frame.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Auto-dismiss; the timer restarts from scratch whenever a pause ends.
  useEffect(() => {
    if (paused) return
    const t = setTimeout(onDismiss, duration)
    return () => clearTimeout(t)
  }, [paused, duration, onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={
        `pointer-events-auto flex min-h-[44px] items-center gap-3 rounded-full pl-4 pr-1.5 shadow-[var(--shadow-float)] ${TONE_CLASS[item.tone ?? 'ink']} ` +
        'motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[var(--ease-ios)] ' +
        (shown ? 'opacity-100 translate-y-0' : 'motion-safe:translate-y-2 motion-safe:opacity-0')
      }
    >
      <span className="min-w-0 flex-1 py-2 text-[14px] font-medium leading-snug tracking-[-0.01em]">
        {item.title}
      </span>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick()
            onDismiss()
          }}
          className="flex h-9 min-w-[44px] shrink-0 items-center justify-center rounded-full bg-paper/95 px-3.5 text-[13px] font-semibold text-ink"
        >
          {item.action.label}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-paper/80 transition-colors hover:bg-paper/15 hover:text-paper"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
