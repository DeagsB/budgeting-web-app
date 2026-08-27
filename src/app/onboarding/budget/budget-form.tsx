'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { saveBudgets } from '@/app/(app)/budgets/actions'
import { completeOnboarding } from '../complete-actions'

export type BudgetCategory = { id: string; name: string; parentName: string | null }

/**
 * One dollar field per leaf category. The amounts are standing - they apply to
 * every month until changed - so `month` only tells the action which month the
 * household is starting from. Empty fields are ignored, so a partial pass is
 * fine. "Finish" saves whatever was entered and ends the guided flow.
 */
export function BudgetForm({ month, categories }: { month: string; categories: BudgetCategory[] }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const groups = new Map<string | null, BudgetCategory[]>()
  for (const c of categories) {
    const arr = groups.get(c.parentName) ?? []
    arr.push(c)
    groups.set(c.parentName, arr)
  }

  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null)
          const res = await saveBudgets(fd)
          if (!res.ok) {
            setError(res.error)
            return
          }
          await completeOnboarding()
        })
      }
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="month" value={month} />

      <div className="flex flex-col gap-5">
        {[...groups.entries()].map(([parent, cats]) => (
          <div key={parent ?? '__root'}>
            {parent && (
              <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">{parent}</div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {cats.map((c) => (
                <label
                  key={c.id}
                  className="flex min-h-[48px] items-center justify-between gap-3 rounded-[12px] border border-hair bg-cream-2 px-3"
                >
                  <span className="truncate text-[14px] font-medium text-ink">{c.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[15px] text-ink-3">
                    $
                    <input
                      name={`budget:${c.id}`}
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      aria-label={`Monthly budget for ${c.name} in dollars`}
                      className="w-[88px] bg-transparent py-2 text-right text-[16px] font-semibold text-ink outline-none placeholder:text-ink-3"
                    />
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-[12px] bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple">
          {error}
        </div>
      )}

      <div className="flex pt-1 sm:justify-end">
        <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full sm:w-auto">
          {pending ? 'Saving…' : 'Save & finish'}
          {!pending && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </Button>
      </div>
    </form>
  )
}
