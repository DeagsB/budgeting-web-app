'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// `document` is only available on the client; this 'use client' file still
// SSRs once on the server, so the portal render is gated through this guard.
const isBrowser = typeof window !== 'undefined'

/**
 * Maple-styled confirm-then-submit button. Wraps a server-action form so the
 * trigger opens an in-app modal (bottom sheet on mobile, centered card on
 * desktop) instead of the browser's `window.confirm()` dialog.
 *
 * Usage:
 *   <ConfirmButton
 *     action={archiveGoal}
 *     formData={{ id: goal.id }}
 *     prompt={`Archive "${goal.name}"?`}
 *     confirmLabel="Archive"
 *     destructive
 *     className="text-[12px] font-semibold text-[var(--color-maple)] hover:underline"
 *   >
 *     Archive
 *   </ConfirmButton>
 *
 * The component renders a real <form action={...}>, then submits it via
 * formRef.current.requestSubmit() once the user confirms — this preserves
 * React 19's server-action wiring instead of bypassing it with manual fetch.
 */
export function ConfirmButton({
  action,
  formData = {},
  prompt,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  className,
  children,
}: {
  action: (fd: FormData) => void | Promise<void>
  formData?: Record<string, string>
  prompt: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleConfirm() {
    setOpen(false)
    // requestSubmit() routes through React 19's form-action machinery;
    // form.submit() would skip it.
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <form ref={formRef} action={action}>
        {Object.entries(formData).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {children}
        </button>
      </form>
      <ConfirmModal
        open={open}
        prompt={prompt}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        onCancel={() => setOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  )
}

/**
 * Standalone modal used by ConfirmButton. Exported so callers that don't fit
 * the form-submit pattern (e.g. plain `<button onClick>`) can drive it
 * directly.
 */
export function ConfirmModal({
  open,
  prompt,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  prompt: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  // Lock body scroll while open so the bottom sheet doesn't drag the page.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Esc to cancel, Enter to confirm — matches OS dialogs.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter' && !e.isComposing) onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onConfirm])

  // Modal is closed by default in every caller, so SSR + first client render
  // both return null — no hydration mismatch, no need for a mount latch.
  if (!isBrowser || !open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={prompt}
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-hidden="true"
        onClick={onCancel}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        className="relative z-10 w-full max-w-[420px] rounded-t-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] shadow-[var(--shadow-float)] sm:rounded-[20px]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}
      >
        <div className="flex justify-center pb-1 pt-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--color-hair)]" aria-hidden />
        </div>
        <div className="px-5 pt-3 sm:pt-6 sm:px-6">
          <h2 className="font-serif text-[20px] leading-tight tracking-[-0.01em] text-[var(--color-ink)] sm:text-[22px]">
            {prompt}
          </h2>
          {description && (
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
              {description}
            </p>
          )}
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-[46px] items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-5 text-[14px] font-semibold text-[var(--color-ink)] active:scale-[0.98]"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className="inline-flex h-[46px] items-center justify-center rounded-full px-5 text-[14px] font-semibold active:scale-[0.98]"
              style={
                destructive
                  ? { background: 'var(--color-maple)', color: 'var(--color-paper)' }
                  : { background: 'var(--color-ink)', color: 'var(--color-paper)' }
              }
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
