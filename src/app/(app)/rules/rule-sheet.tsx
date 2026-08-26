'use client'

import { useActionState, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { CategorySelect } from '@/app/(app)/transactions/category-select'
import { weightsToPercents } from '@/lib/share-split'
import type { RuleDirection, ShareMode } from '@/lib/transaction-rules'
import { previewRule, saveRule, type SaveRuleState } from './actions'

export type RuleSheetMember = { id: string; name: string; weight: number }
export type RuleSheetInitial = {
  id?: string
  name: string
  match_text: string
  amount_min_cents: number | null
  amount_max_cents: number | null
  account_id: string | null
  direction: RuleDirection
  share_mode: ShareMode
  share_weights?: Record<string, number> | null
  category_id: string | null
  is_settlement: boolean
}

type AmountMode = 'any' | 'custom'

/**
 * One sheet for "Always share this" from a transaction and for creating /
 * editing on /rules. Live preview counts come from a dry run over the last
 * 12 months so the user sees what the rule will touch before saving.
 */
type SheetProps = {
  open: boolean
  onClose: () => void
  initial: RuleSheetInitial | null
  accounts: { id: string; name: string }[]
  categories: { id: string; parent_id: string | null; name: string }[]
  members: RuleSheetMember[]
  onSaved?: (ruleId: string) => void
}

/**
 * Thin wrapper: remount the form whenever a different seed opens so every
 * piece of local state initialises from props instead of syncing in effects.
 */
export function RuleSheet(props: SheetProps) {
  if (!props.open || !props.initial) return null
  // Only the identity of the seed matters; derived fields (category, amount
  // band) can change underneath us after a save revalidates the page.
  const seedKey = props.initial.id ?? `new:${props.initial.match_text}`
  return <RuleSheetInner key={seedKey} {...props} initial={props.initial} />
}

function RuleSheetInner({
  open,
  onClose,
  initial,
  accounts,
  categories,
  members,
  onSaved,
}: SheetProps & { initial: RuleSheetInitial }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<SaveRuleState, FormData>(saveRule, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  const [amountMode, setAmountMode] = useState<AmountMode>(() =>
    initial.amount_min_cents !== null || initial.amount_max_cents !== null ? 'custom' : 'any',
  )
  const [direction, setDirection] = useState<RuleDirection>(initial.direction)
  const [shareMode, setShareMode] = useState<ShareMode>(initial.share_mode)
  const [isSettlement, setIsSettlement] = useState(initial.is_settlement)
  const [preview, setPreview] = useState<{ matched: number; shared: number; categorized: number; settled: number; paymentPrompts: number } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const lastKey = useRef('')

  useEffect(() => {
    if (state && 'ok' in state) {
      router.refresh()
      onSaved?.(state.ruleId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const percents = useMemo(() => weightsToPercents(members), [members])
  const ratioLabel = members
    .filter((m) => m.weight > 0)
    .map((m) => `${m.name.split(' ')[0]} ${percents.get(m.id) ?? 0}%`)
    .join(' · ')

  async function runPreview() {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const key = Array.from(fd.entries())
      .map(([k, v]) => `${k}=${String(v)}`)
      .join('&')
    if (key === lastKey.current) return
    lastKey.current = key
    setPreviewing(true)
    const res = await previewRule(fd)
    setPreviewing(false)
    if (res && 'ok' in res) {
      setPreview({ matched: res.matched, shared: res.shared, categorized: res.categorized, settled: res.settled, paymentPrompts: res.paymentPrompts })
    }
  }

  const done = state && 'ok' in state

  return (
    <Sheet open={open} onClose={onClose} title={initial.id ? 'Edit rule' : 'Always do this'}>
      {done ? (
        <div className="flex flex-col gap-4 pb-2">
          <p className="text-[14px] leading-relaxed text-ink-2">
            Rule saved.
            {state.applied
              ? ` Applied to ${state.applied.shared} past transaction${state.applied.shared === 1 ? '' : 's'}${state.applied.categorized ? `, categorised ${state.applied.categorized}` : ''}${state.applied.skippedManual ? `, left ${state.applied.skippedManual} you had split by hand` : ''}.`
              : ' It will run on every new transaction.'}
          </p>
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form
          ref={formRef}
          action={formAction}
          onBlur={() => void runPreview()}
          onChange={() => {
            lastKey.current = ''
          }}
          className="flex flex-col gap-4 pb-2"
        >
          {initial.id && <input type="hidden" name="id" value={initial.id} />}
          <input type="hidden" name="amount_mode" value={amountMode} />
          <input type="hidden" name="direction" value={direction} />
          <input type="hidden" name="share_mode" value={shareMode} />

          <Field label="Merchant contains" required hint="Matches ignoring case, numbers and punctuation.">
            <input name="match_text" defaultValue={initial.match_text} required maxLength={200} className="maple-input" autoFocus={!initial.id} />
          </Field>

          <Field label="Rule name" hint="Shown on shared transactions.">
            <input name="name" defaultValue={initial.name} maxLength={80} className="maple-input" />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Direction</span>
            <SegmentedControl<RuleDirection>
              ariaLabel="Direction"
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'outflow', label: 'Spent' },
                { value: 'inflow', label: 'Received' },
                { value: 'any', label: 'Any' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Amount</span>
            <SegmentedControl<AmountMode>
              ariaLabel="Amount"
              value={amountMode}
              onChange={setAmountMode}
              options={[
                { value: 'any', label: 'Any amount' },
                { value: 'custom', label: 'Within a range' },
              ]}
            />
            {amountMode === 'custom' && (
              <div className="mt-1 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-3">From</span>
                  <input
                    name="amount_min"
                    inputMode="decimal"
                    defaultValue={initial.amount_min_cents !== null ? (initial.amount_min_cents / 100).toFixed(2) : ''}
                    placeholder="0.00"
                    className="maple-input"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-ink-3">To</span>
                  <input
                    name="amount_max"
                    inputMode="decimal"
                    defaultValue={initial.amount_max_cents !== null ? (initial.amount_max_cents / 100).toFixed(2) : ''}
                    placeholder="Any"
                    className="maple-input"
                  />
                </label>
              </div>
            )}
          </div>

          <Field label="Account">
            <select name="account_id" defaultValue={initial.account_id ?? ''} className="maple-select">
              <option value="">Any account</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex min-h-[44px] items-center gap-3 rounded-md bg-cream-2 px-3 text-[13.5px] text-ink">
            <input
              name="is_settlement"
              type="checkbox"
              checked={isSettlement}
              onChange={(e) => setIsSettlement(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-leaf)]"
            />
            <span>
              Payment between members
              <span className="block text-[11.5px] text-ink-3">
                An e-Transfer or reimbursement, not an expense. Matches are recorded as settlements instead of shared.
              </span>
            </span>
          </label>

          {!isSettlement && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Share</span>
            <SegmentedControl<ShareMode>
              ariaLabel="Share"
              value={shareMode}
              onChange={setShareMode}
              options={[
                { value: 'household', label: 'Household ratio' },
                { value: 'custom', label: 'Custom' },
                { value: 'none', label: 'Don’t share' },
              ]}
            />
            {shareMode === 'household' && <p className="text-[12px] text-ink-3">{ratioLabel || 'Set weights on the Setup page.'}</p>}
            {shareMode === 'custom' && (
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {members.map((m) => (
                  <label key={m.id} className="flex min-h-[44px] items-center justify-between gap-3 rounded-md border border-hair bg-paper px-3 text-[13.5px]">
                    <span className="truncate text-ink">{m.name}</span>
                    <input
                      name={`weight:${m.id}`}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      defaultValue={initial.share_weights?.[m.id] ?? m.weight}
                      aria-label={`${m.name} weight`}
                      className="w-16 bg-transparent text-right font-serif text-[15px] text-ink outline-none"
                    />
                  </label>
                ))}
                <p className="text-[11.5px] text-ink-3 sm:col-span-2">Weights, not percents: 1 and 1 is 50/50, 3 and 2 is 60/40, 0 never owes.</p>
              </div>
            )}
          </div>
          )}

          <Field label="Category" hint="Leave blank to keep whatever category the transaction has.">
            <CategorySelect name="category_id" categories={categories} defaultValue={initial.category_id ?? ''} />
          </Field>

          <label className="flex min-h-[44px] items-center gap-3 rounded-md bg-cream-2 px-3 text-[13.5px] text-ink">
            <input name="apply_past" type="checkbox" defaultChecked={!initial.id} className="h-5 w-5 accent-[var(--color-leaf)]" />
            <span>
              Apply to matching past transactions
              <span className="block text-[11.5px] text-ink-3">
                {previewing
                  ? 'Counting…'
                  : preview
                    ? isSettlement
                      ? `${preview.matched} match in the last 12 months · ${preview.settled} would be recorded as payments${preview.paymentPrompts ? ` · ${preview.paymentPrompts} to confirm` : ''}`
                      : `${preview.matched} match in the last 12 months · ${preview.shared} would be shared${preview.categorized ? ` · ${preview.categorized} categorised` : ''}`
                    : 'Transactions you split by hand are never changed.'}
              </span>
            </span>
          </label>

          {state && 'error' in state && (
            <p role="alert" className="rounded-[12px] px-3 py-2 text-[13px] font-medium" style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}>
              {state.error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : initial.id ? 'Save rule' : 'Create rule'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
          {members.length < 2 && shareMode !== 'none' && !isSettlement && (
            <p className="text-[12px] text-ink-3">Sharing needs at least two members. Add one on the Setup page.</p>
          )}
        </form>
      )}
    </Sheet>
  )
}
