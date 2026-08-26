import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PageHeader } from '@/components/ui/page-header'
import { ruleMatches, type TransactionRule } from '@/lib/transaction-rules'
import { RulesList, type RuleRowVM } from './rules-list'

export const dynamic = 'force-dynamic'

/**
 * /rules - every "always do this" the household has set up. Match counts are
 * computed in memory over the last 12 months so the list explains itself.
 */
export default async function RulesPage({ searchParams }: { searchParams: Promise<{ new?: string; desc?: string; amount?: string }> }) {
  const params = await searchParams
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const since = new Date()
  since.setMonth(since.getMonth() - 12)
  const sinceISO = since.toISOString().slice(0, 10)

  const [{ data: rules }, { data: accounts }, { data: categories }, { data: members }, { data: ruleShares }, { data: txs }] =
    await Promise.all([
      supabase
        .from('transaction_rules')
        .select('id, household_id, name, enabled, sort_order, match_text, amount_min_cents, amount_max_cents, account_id, direction, share_mode, share_weights, category_id')
        .eq('household_id', ctx.householdId)
        .order('sort_order')
        .order('id'),
      supabase.from('accounts').select('id, name').eq('household_id', ctx.householdId).is('archived_at', null).order('name'),
      supabase.from('categories').select('id, parent_id, name').eq('household_id', ctx.householdId).is('archived_at', null).order('sort_order'),
      supabase.from('members').select('id, display_name, split_weight').eq('household_id', ctx.householdId).is('archived_at', null).order('sort_order'),
      supabase.from('transaction_shares').select('rule_id, transaction_id').eq('household_id', ctx.householdId).not('rule_id', 'is', null),
      supabase
        .from('transactions')
        .select('id, description, amount_cents, account_id, member_id')
        .eq('household_id', ctx.householdId)
        .gte('occurred_on', sinceISO)
        .order('occurred_on', { ascending: false })
        .limit(5000),
    ])

  const ruleList: TransactionRule[] = (rules ?? []).map((r) => ({
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
  }))

  const txList = (txs ?? []).map((t) => ({
    id: t.id as string,
    description: (t.description as string | null) ?? null,
    amount_cents: Number(t.amount_cents),
    account_id: t.account_id as string,
    member_id: (t.member_id as string | null) ?? null,
  }))

  const sharedByRule = new Map<string, Set<string>>()
  for (const s of ruleShares ?? []) {
    const set = sharedByRule.get(s.rule_id as string) ?? new Set<string>()
    set.add(s.transaction_id as string)
    sharedByRule.set(s.rule_id as string, set)
  }

  const accountName = new Map((accounts ?? []).map((a) => [a.id as string, a.name as string]))
  const categoryName = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]))
  const memberName = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]))

  const rows: RuleRowVM[] = ruleList.map((r) => ({
    rule: r,
    matchCount: txList.filter((t) => ruleMatches({ ...r, enabled: true }, t)).length,
    sharedCount: sharedByRule.get(r.id)?.size ?? 0,
    accountName: r.account_id ? (accountName.get(r.account_id) ?? null) : null,
    categoryName: r.category_id ? (categoryName.get(r.category_id) ?? null) : null,
    customLabel:
      r.share_mode === 'custom' && r.share_weights
        ? Object.entries(r.share_weights)
            .filter(([, w]) => w > 0)
            .map(([id, w]) => `${memberName.get(id) ?? 'Member'} ${w}`)
            .join(' : ')
        : null,
  }))

  const openNew = params.new === '1'
  const seed = openNew
    ? {
        desc: params.desc ?? '',
        amount: params.amount ? Number(params.amount) : null,
      }
    : null

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        eyebrow="Rules"
        title="Set it once. Split it every month."
        subtitle="Rent, utilities, subscriptions: match the merchant and Maple shares or categorises it the moment it lands."
      />
      <RulesList
        rows={rows}
        accounts={(accounts ?? []).map((a) => ({ id: a.id as string, name: a.name as string }))}
        categories={(categories ?? []).map((c) => ({ id: c.id as string, parent_id: (c.parent_id as string | null) ?? null, name: c.name as string }))}
        members={(members ?? []).map((m) => ({ id: m.id as string, name: m.display_name as string, weight: Number(m.split_weight ?? 1) }))}
        seed={seed}
      />
    </div>
  )
}
