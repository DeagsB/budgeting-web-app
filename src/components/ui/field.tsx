import type { ReactNode } from 'react'

/**
 * Form field wrapper: label + control + hint/error. Standardizes forms and
 * lets screens retire legacy `border-gray-300` inputs.
 *
 * The caller supplies the control as `children` (an input/select/textarea using
 * `.maple-input` / `.maple-select` / `.maple-textarea`). The `<label>` wraps the
 * control so clicking the label focuses the field; `htmlFor` is redundant but
 * harmless when the control is also wrapped.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className = '',
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`} htmlFor={htmlFor}>
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
        {required && <span className="text-maple"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="text-[11.5px] font-medium text-maple">{error}</span>
      ) : hint ? (
        <span className="text-[11px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}
