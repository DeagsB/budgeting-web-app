import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { runPlaidHealthSweep, runPlaidSweep } from '@/lib/cron/plaid-sweep'
import { runSettlementAutoClose } from '@/lib/cron/settlement-close'
import { runTransferBackfill } from '@/lib/cron/transfer-backfill'
// Household close days are civil dates; todayISO() is America/Toronto so "the
// 28th" means the 28th for a Canadian household, not UTC's version of it.
import { todayISO } from '@/lib/dates'

// GET /api/cron/daily
//
// One scheduled entry point (Vercel Hobby allows daily crons only; see
// vercel.json). Runs the jobs that must happen even when nobody opens the app:
//   1. Plaid safety-net sweep (webhooks are primary, this catches misses).
//   2. Settlement period auto-close on each household's close day.
//   3. Transfer backfill: one whole-ledger detection pass per household,
//      stamped so it runs once and resumes next day when the budget runs out.
// Authenticated by CRON_SECRET; each job is idempotent so re-runs are safe.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const service = createServiceClient()
  if (!service) return NextResponse.json({ error: 'service key missing' }, { status: 503 })

  const started = Date.now()
  const plaid = await runPlaidSweep(service, { budgetMs: 180_000, perItemMs: 45_000 })
  console.log('[cron/daily] plaid sweep', { ...plaid, items: undefined })

  // Banks waiting on the user: re-check with Plaid so a status nobody cleared
  // (a late webhook, a repair we never heard about) heals within a day.
  const health = await runPlaidHealthSweep(service, { budgetMs: 40_000 })
  console.log('[cron/daily] plaid health', health)

  const settle = await runSettlementAutoClose(service, { todayISO: todayISO() })
  console.log('[cron/daily] settlement auto-close', settle)

  // Pairs transfers that landed before detection existed; a no-op once every
  // household carries its stamp.
  const backfill = await runTransferBackfill(service, { budgetMs: 40_000 })
  console.log('[cron/daily] transfer backfill', backfill)

  return NextResponse.json({ ok: true, ms: Date.now() - started, plaid, health, settle, backfill })
}
