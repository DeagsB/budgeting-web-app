'use client'

import { useActionState } from 'react'
import { createHousehold, type OnboardingState } from './actions'

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(
    createHousehold,
    undefined,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Household name
        <input
          name="household_name"
          type="text"
          required
          maxLength={80}
          placeholder="e.g. Our household"
          className="rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Your display name
        <input
          name="member_name"
          type="text"
          required
          maxLength={80}
          placeholder="How you'll appear in reports"
          className="rounded border border-gray-300 px-3 py-2"
        />
        <span className="text-xs text-gray-500">
          You can add partners or other members after setup.
        </span>
      </label>

      {state?.error && (
        <p className="text-sm text-red-600" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating household…' : 'Create household'}
      </button>
    </form>
  )
}
