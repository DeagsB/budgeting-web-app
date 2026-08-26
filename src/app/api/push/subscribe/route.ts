import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { humanizeDbError } from '@/lib/errors'

// POST   - save (upsert) the caller's PushSubscription for their household.
// DELETE - remove a subscription by endpoint.
// RLS scopes both to household members; the endpoint is the natural key.

export async function POST(request: NextRequest) {
  const ctx = await getHouseholdContext()
  if (!ctx) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })

  let body: { subscription?: PushSubscriptionJSON } & PushSubscriptionJSON
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Couldn't save that. Refresh and try again." }, { status: 400 })
  }
  const sub = body.subscription ?? body
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Couldn't register this device for notifications. Refresh and try again." }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      household_id: ctx.householdId,
      user_id: ctx.userId,
      endpoint,
      p256dh,
      auth,
      user_agent: request.headers.get('user-agent'),
    },
    { onConflict: 'endpoint' },
  )
  if (error) return NextResponse.json({ error: humanizeDbError(error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const ctx = await getHouseholdContext()
  if (!ctx) return NextResponse.json({ error: 'Not authorized.' }, { status: 401 })

  let endpoint: string | undefined
  try {
    endpoint = (await request.json())?.endpoint
  } catch {
    endpoint = undefined
  }
  if (!endpoint) return NextResponse.json({ error: "Couldn't save that. Refresh and try again." }, { status: 400 })

  const supabase = await createClient()
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('household_id', ctx.householdId)
  return NextResponse.json({ ok: true })
}
