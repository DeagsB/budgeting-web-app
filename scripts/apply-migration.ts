/**
 * Apply one SQL migration file to the hosted Supabase Postgres.
 *
 *   node --env-file=.env.local scripts/apply-migration.ts supabase/migrations/<file>.sql
 *
 * Reads DATABASE_URL (Supabase → Project Settings → Database → connection
 * string, "Transaction" pooler or direct). Runs the whole file inside a
 * single transaction so a failing statement rolls everything back.
 *
 * Use this only when the Supabase CLI / dashboard isn't at hand; the
 * migrations folder stays the source of truth either way.
 */

import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const file = process.argv[2]
const url = process.env.DATABASE_URL
if (!file) {
  console.error('Usage: node --env-file=.env.local scripts/apply-migration.ts <path/to/migration.sql>')
  process.exit(1)
}
if (!url) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  await client.query('begin')
  await client.query(sql)
  await client.query('commit')
  console.log(`Applied ${file}`)
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error(`FAILED ${file}: ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
} finally {
  await client.end()
}
