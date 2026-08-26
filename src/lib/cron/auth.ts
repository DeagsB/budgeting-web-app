import { timingSafeEqual } from 'node:crypto'
import { requireCronSecret } from '@/lib/env'

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the env var is
 * set on the project. Compare in constant time; any mismatch or missing
 * secret is a 401 at the route.
 */
export function verifyCronAuth(request: Request): boolean {
  let secret: string
  try {
    secret = requireCronSecret()
  } catch {
    return false
  }
  const header = request.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
