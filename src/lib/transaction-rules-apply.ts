import type { SupabaseClient } from '@supabase/supabase-js'
import { splitByWeights, type WeightedMember } from '@/lib/share-split'
import {
  planCategoryChange,
  planShareChanges,
  resolveRuleEffects,
  resolveShareWeights,
  type ExistingShare,
  type ExistingSplit,
  type RuleTxInput,
  type TransactionRule,
} from '@/lib/transaction-rules'

/**
 * Persist rule effects for a set of transactions. Works with either the
 * session client (manual create / import / retro-apply, subject to RLS) or
 * the service client (Plaid sync, email ingest). Never throws for a single
 * row; returns counts so callers can log.
 */

export type ApplyRulesOptions = { onlyRuleIds?: string[]; dryRun?: boolean }
export type ApplyRulesResult = {
  considered: number
  matched: number
  shared: number
  categorized: number
  skippedManual: number
}

export type RuleContext = { rules: TransactionRule[]; members: WeightedMember[] }

const CHUNK = 500

export async function loadRuleContext(db: SupabaseClient, householdId: string): Promise<RuleContext> {
  const [{ data: rules }, { data: members }] = await Promise.all([
    db
      .from('transaction_rules')
      .select('id, household_id, name, enabled, sort_order, match_text, amount_min_cents, amount_max_cents, account_id, direction, share_mode, share_weights, category_id')
      .eq('household_id', householdId)
      .eq('enabled', true)
      .order('sort_order'),
    db.from('members').select('id, split_weight').eq('household_id', householdId).is('archived_at', null).order('sort_order'),
  ])
  return {
    rules: (rules ?? []).map((r) => ({
      id: r.id as string,
      household_id: r.household_id as string,
      name: r.name as string,
      enabled: r.enabled as boolean,
      sort_order: Number(r.sort_order),
      match_text: r.match_text as string,
      amount_min_cents: r.amount_min_cents === null ? null : Number(r.amount_min_cents),
      amount_max_cents: r.amount_max_cents === null ? null : Number(r.amount_max_cents),
      account_id: (r.account_id as string | null) ?? null,
      direction: r.direction as TransactionRule['direction'],
      share_mode: r.share_mode as TransactionRule['share_mode'],
      share_weights: (r.share_weights as Record<string, number> | null) ?? null,
      category_id: (r.category_id as string | null) ?? null,
    })),
    members: (members ?? []).map((m) => ({ id: m.id as string, weight: Number(m.split_weight ?? 1) })),
  }
}

export async function applyRulesToTransactions(
  db: SupabaseClient,
  householdId: string,
  txIds: string[],
  opts: ApplyRulesOptions = {},
  ctx?: RuleContext,
): Promise<ApplyRulesResult> {
  const result: ApplyRulesResult = { considered: 0, matched: 0, shared: 0, categorized: 0, skippedManual: 0 }
  const ids = Array.from(new Set(txIds.filter(Boolean)))
  if (ids.length === 0) return result

  const context = ctx ?? (await loadRuleContext(db, householdId))
  const rules = opts.onlyRuleIds ? context.rules.filter((r) => opts.onlyRuleIds!.includes(r.id)) : context.rules
  if (rules.length === 0) return result

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const [{ data: txs }, { data: shares }, { data: splits }] = await Promise.all([
      db.from('transactions').select('id, description, amount_cents, account_id, member_id').eq('household_id', householdId).in('id', chunk),
      db.from('transaction_shares').select('transaction_id, member_id, amount_cents, rule_id').in('transaction_id', chunk),
      db.from('transaction_splits').select('id, transaction_id, category_id, category_rule_id').in('transaction_id', chunk),
    ])

    const sharesByTx = new Map<string, ExistingShare[]>()
    for (const s of shares ?? []) {
      const arr = sharesByTx.get(s.transaction_id as string) ?? []
      arr.push({ member_id: s.member_id as string, amount_cents: Number(s.amount_cents), rule_id: (s.rule_id as string | null) ?? null })
      sharesByTx.set(s.transaction_id as string, arr)
    }
    const splitsByTx = new Map<string, ExistingSplit[]>()
    for (const s of splits ?? []) {
      const arr = splitsByTx.get(s.transaction_id as string) ?? []
      arr.push({ id: s.id as string, category_id: (s.category_id as string | null) ?? null, category_rule_id: (s.category_rule_id as string | null) ?? null })
      splitsByTx.set(s.transaction_id as string, arr)
    }

    for (const row of txs ?? []) {
      result.considered += 1
      const tx: RuleTxInput = {
        id: row.id as string,
        description: (row.description as string | null) ?? null,
        amount_cents: Number(row.amount_cents),
        account_id: row.account_id as string,
        member_id: (row.member_id as string | null) ?? null,
      }
      const fx = resolveRuleEffects(rules, tx)
      if (!fx.shareRule && !fx.categoryRule) continue
      result.matched += 1

      if (fx.shareRule) {
        const weights = resolveShareWeights(fx.shareRule, context.members)
        const computed = splitByWeights(Math.abs(tx.amount_cents), tx.member_id, weights)
        const plan = planShareChanges(sharesByTx.get(tx.id) ?? [], computed, fx.shareRule.id)
        if (plan.kind === 'skip-manual') result.skippedManual += 1
        else if (plan.kind === 'replace') {
          result.shared += 1
          if (!opts.dryRun) {
            await db.from('transaction_shares').delete().eq('transaction_id', tx.id)
            if (plan.rows.length > 0) {
              const { error } = await db.from('transaction_shares').insert(
                plan.rows.map((r) => ({
                  household_id: householdId,
                  transaction_id: tx.id,
                  member_id: r.member_id,
                  amount_cents: r.amount_cents,
                  rule_id: fx.shareRule!.id,
                })),
              )
              if (error) console.error('[rules] share insert failed', { tx: tx.id, code: error.code, msg: error.message })
            }
          }
        }
      }

      if (fx.categoryRule?.category_id) {
        const plan = planCategoryChange(splitsByTx.get(tx.id) ?? [], fx.categoryRule.category_id)
        if (plan.kind === 'set') {
          result.categorized += 1
          if (!opts.dryRun) {
            const { error } = await db
              .from('transaction_splits')
              .update({ category_id: fx.categoryRule.category_id, category_rule_id: fx.categoryRule.id })
              .eq('id', plan.splitId)
            if (error) console.error('[rules] category update failed', { tx: tx.id, code: error.code, msg: error.message })
          }
        }
      }
    }
  }
  return result
}

/** Transaction ids in the household within a trailing window (for retro-apply / previews). */
export async function recentTransactionIds(db: SupabaseClient, householdId: string, sinceISO: string, limit = 5000): Promise<string[]> {
  const { data } = await db
    .from('transactions')
    .select('id')
    .eq('household_id', householdId)
    .gte('occurred_on', sinceISO)
    .order('occurred_on', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r) => r.id as string)
}
