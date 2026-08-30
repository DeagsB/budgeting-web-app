/**
 * One-off household wipe. Deletes EVERYTHING that belongs to one household
 * (transactions, accounts, Plaid items, budgets, rules, goals, members...) but
 * keeps the auth login, so the next sign-in lands on onboarding.
 *
 * Runs against the hosted Supabase project with the service-role key, so it
 * bypasses RLS. Irreversible. Dry-run is the default.
 *
 *   node --env-file=.env.local scripts/wipe-household.ts                          # list users + households
 *   node --env-file=.env.local scripts/wipe-household.ts --email you@x.com        # dry-run report
 *   node --env-file=.env.local scripts/wipe-household.ts --email you@x.com --yes  # wipe
 *   node --env-file=.env.local scripts/wipe-household.ts --household <uuid> --yes
 *
 * Needs Node >= 22.6 (type stripping). Excluded from tsc / eslint / vitest.
 *
 * Delete order matters: transactions.account_id is the schema's only
 * `on delete restrict` FK, so transactions go before the household row
 * (whose cascade would otherwise race that RESTRICT against accounts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'
import { createDecipheriv } from 'node:crypto'

// ─── args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function flag(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? undefined : argv[i + 1]
}
const email = flag('email')?.trim().toLowerCase()
const householdArg = flag('household')?.trim()
const yes = argv.includes('--yes')

// ─── clients (mirrors src/lib/supabase/service.ts + src/lib/plaid.ts) ──────

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local).')
  process.exit(1)
}
const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

function plaidClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  const env = process.env.PLAID_ENV
  if (!clientId || !secret || !env || !(env in PlaidEnvironments)) return null
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: { headers: { 'PLAID-CLIENT-ID': clientId, 'PLAID-SECRET': secret } },
    }),
  )
}

function decryptToken(blob: string): string {
  const raw = process.env.PLAID_TOKEN_KEY
  if (!raw) throw new Error('PLAID_TOKEN_KEY is not configured.')
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('PLAID_TOKEN_KEY must be 32 bytes (base64).')
  const buf = Buffer.from(blob, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', k, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}

// ─── helpers ───────────────────────────────────────────────────────────────

function fail(msg: string): never {
  console.error(`\nFAILED: ${msg}`)
  process.exit(1)
}

/** Every table that carries household_id. plaid_item_secrets is keyed by item_id and handled separately. */
const HOUSEHOLD_TABLES = [
  'transactions',
  'transaction_splits',
  'transaction_shares',
  'transfers',
  'accounts',
  'account_balance_snapshots',
  'plaid_items',
  'plaid_sync_log',
  'categories',
  'monthly_budgets',
  'category_budgets',
  'transaction_rules',
  'members',
  'household_users',
  'household_invitations',
  'goals',
  'loan_details',
  'loan_rate_changes',
  'member_contribution_rooms',
  'time_off_entries',
  'settlements',
  'settlement_periods',
  'bank_email_rules',
  'email_ingestion_log',
  'push_subscriptions',
] as const

async function countRows(table: string, column: string, value: string | string[]): Promise<number> {
  let q = db.from(table).select('*', { count: 'exact', head: true })
  q = Array.isArray(value) ? q.in(column, value) : q.eq(column, value)
  const { count, error } = await q
  if (error) fail(`count ${table}: ${error.message}`)
  return count ?? 0
}

async function report(householdId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const t of HOUSEHOLD_TABLES) out[t] = await countRows(t, 'household_id', householdId)
  const { data: items } = await db.from('plaid_items').select('id').eq('household_id', householdId)
  const itemIds = (items ?? []).map((i) => i.id as string)
  out.plaid_item_secrets = itemIds.length ? await countRows('plaid_item_secrets', 'item_id', itemIds) : 0
  out.households = await countRows('households', 'id', householdId)
  return out
}

function printReport(r: Record<string, number>) {
  const w = Math.max(...Object.keys(r).map((k) => k.length))
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(w)}  ${String(v).padStart(6)}`)
}

async function listUsers() {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (error) fail(`listUsers: ${error.message}`)
  return data.users
}

// ─── main ──────────────────────────────────────────────────────────────────

async function main() {
  const users = await listUsers()

  if (!email && !householdArg) {
    console.log('No target given. Users and their households:\n')
    const { data: hus } = await db.from('household_users').select('user_id, household_id, role')
    const { data: hhs } = await db.from('households').select('id, name')
    const nameOf = new Map((hhs ?? []).map((h) => [h.id as string, h.name as string]))
    for (const u of users) {
      const mine = (hus ?? []).filter((h) => h.user_id === u.id)
      const desc = mine.length
        ? mine.map((h) => `${nameOf.get(h.household_id as string) ?? '?'} (${h.household_id}, ${h.role})`).join('; ')
        : '- no household -'
      console.log(`  ${(u.email ?? u.id).padEnd(40)}  ${desc}`)
    }
    console.log('\nRe-run with --email <addr> or --household <uuid>.')
    return
  }

  let householdId = householdArg
  const user = email ? users.find((u) => u.email?.toLowerCase() === email) : undefined
  if (email && !user) fail(`No auth user with email ${email}.`)

  if (!householdId) {
    const { data: hus, error } = await db.from('household_users').select('household_id').eq('user_id', user!.id)
    if (error) fail(error.message)
    if (!hus || hus.length === 0) fail(`${email} has no household - nothing to wipe.`)
    if (hus.length > 1) fail(`${email} belongs to ${hus.length} households; pass --household <uuid>.`)
    householdId = hus[0].household_id as string
  }
  const hid: string = householdId

  const { data: hh } = await db.from('households').select('id, name').eq('id', hid).maybeSingle()
  if (!hh) fail(`Household ${hid} not found.`)

  const { data: logins } = await db.from('household_users').select('user_id, role').eq('household_id', hid)
  const loginRows = (logins ?? []).map((l) => {
    const u = users.find((x) => x.id === l.user_id)
    return `${u?.email ?? l.user_id} (${l.role})`
  })

  console.log(`\nHousehold: "${hh.name}"  ${hh.id}`)
  console.log(`Logins (KEPT in auth.users): ${loginRows.join(', ') || 'none'}\n`)
  console.log('Rows that will be deleted:')
  const before = await report(hid)
  printReport(before)

  if (!yes) {
    console.log('\nDry run. Re-run with --yes to delete. This cannot be undone.')
    return
  }

  console.log('\n--yes given. Wiping...\n')

  // 1. Tell Plaid to forget every item (best-effort; sandbox items are harmless if this fails).
  const plaid = plaidClient()
  const { data: items } = await db.from('plaid_items').select('id, institution_name, status').eq('household_id', hid)
  for (const it of items ?? []) {
    const label = `${it.institution_name ?? 'Bank'} [${it.status}] ${it.id}`
    if (!plaid) {
      console.log(`  plaid: skipped ${label} (Plaid not configured)`)
      continue
    }
    const { data: secret } = await db
      .from('plaid_item_secrets')
      .select('access_token_encrypted')
      .eq('item_id', it.id)
      .maybeSingle()
    if (!secret?.access_token_encrypted) {
      console.log(`  plaid: no token for ${label}`)
      continue
    }
    try {
      await plaid.itemRemove({ access_token: decryptToken(secret.access_token_encrypted as string) })
      console.log(`  plaid: removed ${label}`)
    } catch (e) {
      console.log(`  plaid: FAILED ${label}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 2-5. Ordered deletes.
  const steps: Array<[string, () => PromiseLike<{ error: { message: string } | null }>]> = [
    ['settlements', () => db.from('settlements').delete().eq('household_id', hid)],
    ['transactions', () => db.from('transactions').delete().eq('household_id', hid)],
    ['plaid_items', () => db.from('plaid_items').delete().eq('household_id', hid)],
    ['households', () => db.from('households').delete().eq('id', hid)],
  ]
  for (const [name, run] of steps) {
    const { error } = await run()
    if (error) fail(`delete ${name}: ${error.message}`)
    console.log(`  deleted ${name}`)
  }

  // 6. Verify.
  console.log('\nRemaining rows (all should be 0):')
  const after = await report(hid)
  printReport(after)
  const leftovers = Object.entries(after).filter(([, v]) => v > 0)
  if (leftovers.length) fail(`Leftover rows: ${leftovers.map(([k, v]) => `${k}=${v}`).join(', ')}`)

  const kept = (await listUsers()).filter((u) => (logins ?? []).some((l) => l.user_id === u.id))
  console.log(`\nAuth users kept: ${kept.map((u) => u.email).join(', ')}`)
  console.log('Wipe complete. Next sign-in lands on /onboarding.')
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)))
