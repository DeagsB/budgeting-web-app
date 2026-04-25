import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses RLS — only use from server code that
 * authenticates the caller through some other channel (e.g. the email-ingest
 * webhook validates a per-household secret).
 *
 * Returns null if SUPABASE_SERVICE_ROLE_KEY is not configured. Callers must
 * handle that case (the webhook route returns 503).
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
