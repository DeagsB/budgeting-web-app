import { redirect } from 'next/navigation'

/**
 * /settlements merged into /shared. Push notifications and old bookmarks
 * still carry `?period=<id>`; the Shared page highlights that period.
 */
export default async function SettlementsRedirect({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const params = await searchParams
  redirect(params.period ? `/shared?period=${encodeURIComponent(params.period)}` : '/shared')
}
