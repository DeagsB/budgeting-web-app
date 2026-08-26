import { normalizeMerchant } from '@/lib/statement-reconcile'
import type { ShareRow, WeightedMember } from '@/lib/share-split'

/**
 * Transaction rules: pure matching + precedence + change planning. No I/O.
 * src/lib/transaction-rules-apply.ts persists what these decide.
 *
 * Matching is a normalised "contains": both the rule text and the
 * transaction description go through normalizeMerchant (upper-case, digits
 * and punctuation stripped), so "netflix" matches "NETFLIX.COM 12345".
 *
 * Precedence: rules are ordered (sort_order, id). For each ACTION the first
 * matching rule that sets it wins - the first rule with a share policy
 * decides sharing, the first rule with a category decides category. That lets
 * a broad "HYDRO → Utilities" rule coexist with a narrower "HYDRO over $100,
 * shared" rule without either blocking the other.
 */

export type RuleDirection = 'outflow' | 'inflow' | 'any'
export type ShareMode = 'none' | 'household' | 'custom'

export type TransactionRule = {
  id: string
  household_id: string
  name: string
  enabled: boolean
  sort_order: number
  match_text: string
  amount_min_cents: number | null
  amount_max_cents: number | null
  account_id: string | null
  direction: RuleDirection
  share_mode: ShareMode
  share_weights: Record<string, number> | null
  category_id: string | null
  /** "This merchant is a payment between members" (e-Transfer). Never shares. */
  is_settlement: boolean
}

export type RuleTxInput = {
  id: string
  description: string | null
  amount_cents: number
  account_id: string
  member_id: string | null
}

export function ruleMatches(rule: TransactionRule, tx: RuleTxInput): boolean {
  if (!rule.enabled) return false
  const needle = normalizeMerchant(rule.match_text)
  if (!needle) return false
  const hay = normalizeMerchant(tx.description)
  if (!hay.includes(needle)) return false

  if (rule.direction === 'outflow' && !(tx.amount_cents > 0)) return false
  if (rule.direction === 'inflow' && !(tx.amount_cents < 0)) return false

  const abs = Math.abs(tx.amount_cents)
  if (rule.amount_min_cents !== null && abs < rule.amount_min_cents) return false
  if (rule.amount_max_cents !== null && abs > rule.amount_max_cents) return false

  if (rule.account_id && rule.account_id !== tx.account_id) return false
  return true
}

export function sortRules(rules: TransactionRule[]): TransactionRule[] {
  return rules
    .filter((r) => r.enabled)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
}

export type RuleEffects = {
  shareRule: TransactionRule | null
  categoryRule: TransactionRule | null
  /** First matching settlement rule. A payment is never shared, so it also blocks sharing. */
  settlementRule: TransactionRule | null
  matched: TransactionRule[]
}

export function resolveRuleEffects(rules: TransactionRule[], tx: RuleTxInput): RuleEffects {
  const sorted = sortRules(rules)
  // A settlement rule anywhere in the order makes the row a payment, which is
  // never an expense to share; check that first so sharing can be suppressed.
  const settlementRule = sorted.find((r) => r.is_settlement && ruleMatches(r, tx)) ?? null
  let shareRule: TransactionRule | null = null
  let categoryRule: TransactionRule | null = null
  const matched: TransactionRule[] = []
  for (const r of sorted) {
    if (!ruleMatches(r, tx)) continue
    matched.push(r)
    if (!shareRule && r.share_mode !== 'none' && !settlementRule) shareRule = r
    if (!categoryRule && r.category_id) categoryRule = r
    if ((shareRule || settlementRule) && categoryRule) break
  }
  return { shareRule, categoryRule, settlementRule, matched }
}

/**
 * Which members split a rule-shared transaction, and by what weights.
 * 'household' → the active members with their split_weight; 'custom' → only
 * the members named in share_weights (unknown / archived ids dropped).
 */
export function resolveShareWeights(rule: TransactionRule, activeMembers: WeightedMember[]): WeightedMember[] {
  if (rule.share_mode === 'custom' && rule.share_weights) {
    const w = rule.share_weights
    return activeMembers
      .filter((m) => typeof w[m.id] === 'number' && w[m.id] > 0)
      .map((m) => ({ id: m.id, weight: w[m.id] }))
  }
  return activeMembers
}

// ─── Change planning (idempotent + manual-edit safe) ───────────────────────

export type ExistingShare = { member_id: string; amount_cents: number; rule_id: string | null }

export type SharePlan =
  | { kind: 'noop' }
  | { kind: 'skip-manual' }
  | { kind: 'replace'; rows: ShareRow[] }

/**
 * A transaction's shares are only rule-managed while EVERY existing share row
 * carries a rule_id. One manual row means a person decided, and we leave it.
 * Identical rule-computed rows are a no-op so re-runs are free.
 */
export function planShareChanges(existing: ExistingShare[], computed: ShareRow[], ruleId: string): SharePlan {
  if (existing.some((s) => s.rule_id === null)) return { kind: 'skip-manual' }
  if (computed.length === 0 && existing.length === 0) return { kind: 'noop' }
  const same =
    existing.length === computed.length &&
    existing.every((s) => s.rule_id === ruleId) &&
    computed.every((c) => existing.some((s) => s.member_id === c.member_id && s.amount_cents === c.amount_cents))
  if (same) return { kind: 'noop' }
  return { kind: 'replace', rows: computed }
}

export type ExistingSplit = { id: string; category_id: string | null; category_rule_id: string | null }

export type CategoryPlan = { kind: 'noop' } | { kind: 'skip' } | { kind: 'set'; splitId: string }

/**
 * Rules only categorise a single-split transaction whose category is empty or
 * was itself set by a rule. A category a person chose is never replaced;
 * multi-split allocations are never touched.
 */
export function planCategoryChange(splits: ExistingSplit[], categoryId: string): CategoryPlan {
  if (splits.length !== 1) return { kind: 'skip' }
  const s = splits[0]
  if (s.category_id === categoryId) return { kind: 'noop' }
  if (s.category_id !== null && s.category_rule_id === null) return { kind: 'skip' }
  return { kind: 'set', splitId: s.id }
}

// ─── UI helpers ────────────────────────────────────────────────────────────

export type RulePrefill = {
  name: string
  match_text: string
  amount_min_cents: number | null
  amount_max_cents: number | null
  account_id: string | null
  direction: RuleDirection
  share_mode: ShareMode
  category_id: string | null
  is_settlement: boolean
}

/** Seed the "Always share" sheet from a transaction (±10% amount band). */
export function prefillRuleFromTransaction(
  tx: RuleTxInput & { category_id?: string | null },
  opts: { amountTolerancePct?: number } = {},
): RulePrefill {
  const key = normalizeMerchant(tx.description)
  const abs = Math.abs(tx.amount_cents)
  const pct = opts.amountTolerancePct ?? 10
  const band = Math.round((abs * pct) / 100)
  return {
    name: titleCase(key) || 'New rule',
    match_text: key,
    amount_min_cents: abs > 0 ? Math.max(0, abs - band) : null,
    amount_max_cents: abs > 0 ? abs + band : null,
    account_id: null,
    direction: tx.amount_cents < 0 ? 'inflow' : 'outflow',
    share_mode: 'household',
    category_id: tx.category_id ?? null,
    is_settlement: false,
  }
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Short human summary for list rows: "NETFLIX · Spent · $15–$18 · Any account". */
export function describeRuleMatch(rule: TransactionRule, formatMoney: (c: number) => string, accountName?: string | null): string {
  const parts = [normalizeMerchant(rule.match_text) || rule.match_text]
  parts.push(rule.direction === 'inflow' ? 'Received' : rule.direction === 'any' ? 'Any direction' : 'Spent')
  if (rule.amount_min_cents !== null || rule.amount_max_cents !== null) {
    const lo = rule.amount_min_cents !== null ? formatMoney(rule.amount_min_cents) : null
    const hi = rule.amount_max_cents !== null ? formatMoney(rule.amount_max_cents) : null
    parts.push(lo && hi ? `${lo}–${hi}` : lo ? `≥ ${lo}` : `≤ ${hi}`)
  }
  parts.push(accountName ?? 'Any account')
  return parts.join(' · ')
}
