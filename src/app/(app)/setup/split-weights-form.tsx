'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { weightsToPercents } from '@/lib/share-split'
import { saveSplitWeights } from './actions'

/**
 * Household default split. Integer weights per member with a live percent so
 * "3 and 2" reads as 60/40 without anyone doing arithmetic.
 */
export function SplitWeightsForm({ members }: { members: { id: string; name: string; weight: number }[] }) {
  const router = useRouter()
  const [weights, setWeights] = useState<Record<string, number>>(() => Object.fromEntries(members.map((m) => [m.id, m.weight])))
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  const percents = useMemo(() => weightsToPercents(members.map((m) => ({ id: m.id, weight: weights[m.id] ?? 0 }))), [members, weights])
  const dirty = members.some((m) => (weights[m.id] ?? 0) !== m.weight)

  if (members.length === 0) return null

  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await saveSplitWeights(fd)
          if (res && 'error' in res) setNote(res.error)
          else {
            setNote('Saved.')
            router.refresh()
          }
        })
      }
      className="mt-3 flex flex-col gap-3"
    >
      <p className="text-[13px] leading-relaxed text-ink-2">
        Used when you mark a transaction shared or a rule shares it. Weights, not percents: 1 and 1 is 50/50, 3 and 2 is 60/40, 0 never owes a share. Any single transaction can still be edited.
      </p>
      <ul className="flex flex-col gap-2">
        {members.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 rounded-md border border-hair bg-paper px-3 py-2">
            <div className="min-w-0">
              <div className="truncate font-serif text-[16px] text-ink">{m.name}</div>
              <div className="text-[12px] text-ink-3">{percents.get(m.id) ?? 0}% of every shared expense</div>
            </div>
            <input
              name={`weight:${m.id}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={weights[m.id] ?? 0}
              onChange={(e) => setWeights((w) => ({ ...w, [m.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
              aria-label={`${m.name} weight`}
              className="maple-input w-20 text-right"
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save split'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setWeights(Object.fromEntries(members.map((m) => [m.id, 1])))}
        >
          Reset to equal
        </Button>
        {note && <span className="text-[12.5px] text-ink-2">{note}</span>}
      </div>
    </form>
  )
}
