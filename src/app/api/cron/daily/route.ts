import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/auth'
import { createServiceClient } from '@/lib/supabase/service'
import { runPlaidSweep } from '@/lib/cron/plaid-sweep'
import { runSettlementAutoClose } from '@/lib/cron/settlement-close'

// GET /api/cron/daily
//
// One scheduled entry point (Vercel Hobby allows daily crons only; see
// vercel.json). Runs the jobs that must happen even when nobody opens the app:
//   1. Plaid safety-net sweep (webhooks are primary, this catches misses).
//   2. Settlement period auto-close on each household's close day.
// Authenticated by CRON_SECRET; each job is idempotent so re-runs are safe.

export const maxDuration = 300
export const dynamic = 'force-dynamic'

function todayISO(): string {
  // Household close days are civil dates; use America/Toronto so "the 28th"
  // means the 28th for a Canadian household, not UTC's version of it.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const service = createServiceClient()
  if (!service) return NextResponse.json({ error: 'service key missing' }, { status: 503 })

  const started = Date.now()
  const plaid = await runPlaidSweep(service, { budgetMs: 200_000, perItemMs: 45_000 })
  console.log('[cron/daily] plaid sweep', { ...plaid, items: undefined })

  const settle = await runSettlementAutoClose(service, { todayISO: todayISO() })
  console.log('[cron/daily] settlement auto-close', settle)

  return NextResponse.json({ ok: true, ms: Date.now() - started, plaid, settle })
}
