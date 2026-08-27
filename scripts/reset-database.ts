/**
 * Full reset. Deletes EVERY household and EVERY auth user, leaving an empty
 * database whose next sign-up is a genuine first run.
 *
 * This is not the same as scripts/wipe-household.ts, which clears one
 * household and keeps the logins. Nothing here is recoverable: deleted auth
 * users have to sign up again from scratch.
 *
 *   node --env-file=.env.local scripts/reset-database.ts         # dry-run report
 *   node --env-file=.env.local scripts/reset-database.ts --yes   # do it
 *
 * Needs Node >= 22.6 (type stripping). Excluded from tsc / eslint / vitest.
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('FAILED: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } })
const confirmed = process.argv.includes('--yes')

/** Every table that carries household_id; all of them cascade from households. */
const HOUSEHOLD_TABLES = [
  'transactions',
  'transaction_splits',
  'transaction_shares',
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

async function countAll(table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) {
    console.error(`  ! could not count ${table}: ${error.message}`)
    return -1
  }
  return count ?? 0
}

const { data: households, error: hErr } = await db.from('households').select('id, name')
if (hErr) {
  console.error(`FAILED: list households: ${hErr.message}`)
  process.exit(1)
}
const { data: userList, error: uErr } = await db.auth.admin.listUsers()
if (uErr) {
  console.error(`FAILED: list users: ${uErr.message}`)
  process.exit(1)
}
const users = userList.users

console.log(`\nProject: ${url}`)
console.log(`\nHouseholds (${households?.length ?? 0}):`)
for (const h of households ?? []) console.log(`  - ${h.name} (${h.id})`)
console.log(`\nAuth users (${users.length}):`)
for (const u of users) console.log(`  - ${u.email ?? u.id}`)

console.log('\nRows now:')
for (const t of HOUSEHOLD_TABLES) {
  const n = await countAll(t)
  if (n !== 0) console.log(`  ${t.padEnd(28)} ${n}`)
}

if (!confirmed) {
  console.log('\nDry run. Nothing deleted. Re-run with --yes to delete all of the above.')
  process.exit(0)
}

console.log('\nDeleting households (cascades to everything under them)...')
for (const h of households ?? []) {
  const { error } = await db.from('households').delete().eq('id', h.id)
  console.log(`  ${error ? `FAILED ${h.name}: ${error.message}` : `deleted ${h.name}`}`)
}

console.log('\nDeleting auth users...')
for (const u of users) {
  const { error } = await db.auth.admin.deleteUser(u.id)
  console.log(`  ${error ? `FAILED ${u.email}: ${error.message}` : `deleted ${u.email ?? u.id}`}`)
}

console.log('\nLeft behind:')
let dirty = false
for (const t of HOUSEHOLD_TABLES) {
  const n = await countAll(t)
  if (n > 0) {
    console.log(`  ${t.padEnd(28)} ${n}`)
    dirty = true
  }
}
const { data: after } = await db.auth.admin.listUsers()
const { data: hAfter } = await db.from('households').select('id')
console.log(`  households                   ${hAfter?.length ?? 0}`)
console.log(`  auth users                   ${after?.users.length ?? 0}`)
if (!dirty && (after?.users.length ?? 0) === 0 && (hAfter?.length ?? 0) === 0) {
  console.log('\nDatabase is empty. The next sign-up starts a fresh household.')
}
