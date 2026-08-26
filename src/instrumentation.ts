/**
 * Runs once per server instance before it accepts requests. Throwing here
 * fails the boot loudly, which is what we want for a missing production env
 * var: a broken deploy is visible, a broken first request is not.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { validateEnvAtBoot } = await import('@/lib/env')
  validateEnvAtBoot()
}
