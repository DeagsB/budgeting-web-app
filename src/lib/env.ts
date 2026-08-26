/**
 * Zero-dependency env validation. Server-only.
 *
 * Two goals:
 *  - never let an unset/misspelled PLAID_ENV silently mean "sandbox" in prod
 *    (that flag also gates whether unsigned webhooks are accepted);
 *  - fail the deployment at boot (via src/instrumentation.ts) when a var that
 *    production cannot run without is missing, instead of failing on the first
 *    request from a user.
 */

export type PlaidEnv = 'sandbox' | 'production'

const PLAID_ENVS: readonly PlaidEnv[] = ['sandbox', 'production']

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
}

/**
 * Resolve PLAID_ENV. Unset → 'production' whenever the runtime is production,
 * so a forgotten variable fails closed (signed webhooks required, production
 * API base) rather than quietly talking to sandbox. Any other value throws.
 */
export function getPlaidEnv(): PlaidEnv {
  const raw = process.env.PLAID_ENV?.trim().toLowerCase()
  if (!raw) return isProductionRuntime() ? 'production' : 'sandbox'
  if ((PLAID_ENVS as readonly string[]).includes(raw)) return raw as PlaidEnv
  throw new Error(`PLAID_ENV must be one of ${PLAID_ENVS.join(' | ')}; got "${process.env.PLAID_ENV}".`)
}

export function isPlaidConfigured(): boolean {
  return !!process.env.PLAID_CLIENT_ID && !!process.env.PLAID_SECRET
}

export function requireCronSecret(): string {
  const s = process.env.CRON_SECRET
  if (!s || s.length < 16) throw new Error('CRON_SECRET is missing or shorter than 16 characters.')
  return s
}

/** Collect every problem rather than stopping at the first, so one deploy fixes them all. */
export function collectEnvProblems(): string[] {
  const problems: string[] = []
  const prod = isProductionRuntime()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) problems.push('NEXT_PUBLIC_SUPABASE_URL is not set.')
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) problems.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')

  if (isPlaidConfigured()) {
    let env: PlaidEnv | null = null
    try {
      env = getPlaidEnv()
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e))
    }

    const key = process.env.PLAID_TOKEN_KEY
    if (!key) problems.push('PLAID_TOKEN_KEY is not set (needed to encrypt Plaid access tokens).')
    else if (Buffer.from(key, 'base64').length !== 32) problems.push('PLAID_TOKEN_KEY must decode to exactly 32 bytes.')

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      problems.push('SUPABASE_SERVICE_ROLE_KEY is not set (Plaid sync writes need it).')
    }

    if (env === 'production') {
      if (!process.env.PLAID_WEBHOOK_URL) problems.push('PLAID_WEBHOOK_URL is required when PLAID_ENV=production.')
      if (!process.env.PLAID_REDIRECT_URI) problems.push('PLAID_REDIRECT_URI is required when PLAID_ENV=production (OAuth banks).')
    }
  }

  // Only the Vercel production deployment runs the cron; local `next start`
  // and preview deploys should not need the secret.
  if (prod && process.env.VERCEL_ENV === 'production') {
    try {
      requireCronSecret()
    } catch (e) {
      problems.push(e instanceof Error ? e.message : String(e))
    }
  }

  return problems
}

/** Throws a single aggregated error when anything is misconfigured. */
export function validateEnvAtBoot(): void {
  const problems = collectEnvProblems()
  if (problems.length === 0) return
  throw new Error(`Environment misconfigured:\n - ${problems.join('\n - ')}`)
}
