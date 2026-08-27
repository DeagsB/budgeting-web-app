'use client'

import { useActionState, useState } from 'react'
import { createHousehold, type OnboardingState } from './actions'

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    createHousehold,
    undefined,
  )
  const [household, setHousehold] = useState('')
  const [member, setMember] = useState('')

  const initial = (member.trim()[0] ?? '?').toUpperCase()
  const ready = household.trim().length > 0 && member.trim().length > 0

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {/* Live preview pill - reinforces the "household + you" mental model */}
      <div className="flex items-center gap-3 rounded-[16px] bg-[var(--color-cream-2)] px-4 py-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-[var(--color-paper)] font-serif text-[18px] text-[var(--color-ink)]"
          style={{ background: 'var(--color-leaf-soft)' }}
        >
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[18px] leading-tight tracking-[-0.01em] text-[var(--color-ink)]">
            {household.trim() || 'Your household'}
          </div>
          <div className="truncate text-[12px] text-[var(--color-ink-2)]">
            {member.trim() ? `${member.trim()} · member` : 'Your display name'}
          </div>
        </div>
      </div>

      <Field
        label="Household name"
        hint="Shows at the top of every page - e.g. “The Tremblay household”."
      >
        <input
          name="household_name"
          type="text"
          required
          maxLength={80}
          value={household}
          onChange={(e) => setHousehold(e.target.value)}
          placeholder="Our household"
          className="maple-input"
          autoFocus
        />
      </Field>

      <Field
        label="Your display name"
        hint="How you’ll appear in reports, splits and settlements."
      >
        <input
          name="member_name"
          type="text"
          required
          maxLength={80}
          value={member}
          onChange={(e) => setMember(e.target.value)}
          placeholder="Alex"
          className="maple-input"
        />
      </Field>

      {state?.error && (
        <div
          role="alert"
          className="rounded-[12px] px-3 py-2 text-[13px] font-medium"
          style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
        >
          {state.error}
        </div>
      )}

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12px] text-[var(--color-ink-3)]">
          You can invite others after setup.
        </div>
        <button
          type="submit"
          disabled={pending || !ready}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--color-ink)] px-5 py-3 text-[14px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create household'}
          {!pending && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </div>
    </form>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] leading-relaxed text-[var(--color-ink-3)]">{hint}</span>}
    </label>
  )
}
