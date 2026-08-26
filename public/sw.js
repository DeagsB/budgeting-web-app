/* Maple service worker.
 *
 * Goals (in priority order):
 *   1. Be installable - Safari iOS only treats a site as a PWA if a SW is
 *      registered, even if the SW does almost nothing.
 *   2. Don't serve stale financial data - money screens must be live.
 *      Network-first for navigations; never touch API, Supabase, or
 *      React Server Component (RSC) payloads. Client-side <Link>
 *      navigations fetch `/route?_rsc=...` with an `RSC: 1` header and
 *      carry rendered financial data, so they must never hit a cache.
 *   3. Static asset cache for /_next/static/* so the app shell paints fast
 *      after the first visit and works offline (showing /offline.html when
 *      the network is gone).
 *   4. Never swap a new worker in under a live session without asking.
 *      A deploy mid-session used to 404 old chunks; now the new worker
 *      waits until the page posts SKIP_WAITING (see sw-registrar.tsx).
 *
 * No Workbox, no build step, no precache manifest - change this file by hand.
 */

const CACHE_VERSION = 'maple-v3'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`
const OFFLINE_URL = '/offline.html'

// Same-origin paths that are safe to serve stale-while-revalidate. Anything
// not listed here (and not a static chunk or navigation) is network-only.
const RUNTIME_PATH_PREFIXES = ['/splash/', '/_next/image']
const RUNTIME_PATHS = new Set([
  '/icon',
  '/icon-192',
  '/icon-maskable',
  '/apple-icon',
  '/manifest.webmanifest',
  OFFLINE_URL,
])
const RUNTIME_DESTINATIONS = new Set(['font', 'image', 'style', 'script'])

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE)
      await cache.addAll([OFFLINE_URL, '/apple-icon', '/icon'])
      // No skipWaiting() here: the page decides when to swap workers.
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(`${CACHE_VERSION}-`))
          .map((k) => caches.delete(k)),
      )
      // Let the browser start the navigation fetch in parallel with SW boot.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable()
        } catch {
          /* unsupported or disabled - networkFirstPage falls back to fetch */
        }
      }
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Next.js App Router internals: RSC payloads, prefetches, server actions.
  // These carry rendered user data and must go straight to the network.
  if (isNextRouterRequest(req, url)) return

  // Never cache anything that looks like data - keep money live.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/auth/v1/')
  ) {
    return
  }

  // Cache-first for hashed Next static assets - they're immutable by URL.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(req))
    return
  }

  // Navigation requests: network-first, fall back to cached shell offline.
  // Never caches the HTML itself (authed pages must stay live).
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstPage(event))
    return
  }

  // Explicit allowlist of app-shell assets: stale-while-revalidate.
  if (isRuntimeCacheable(req, url)) {
    event.respondWith(staleWhileRevalidate(req))
    return
  }

  // Everything else: network only, no respondWith.
})

function isNextRouterRequest(req, url) {
  if (req.headers.get('RSC') === '1') return true
  if (url.searchParams.has('_rsc')) return true
  if (req.headers.get('Next-Router-Prefetch') === '1') return true
  if (req.headers.get('Next-Action')) return true
  if (req.destination === '' && req.mode === 'cors') {
    const accept = req.headers.get('Accept') || ''
    if (accept.includes('text/x-component')) return true
  }
  return false
}

function isRuntimeCacheable(req, url) {
  if (RUNTIME_PATHS.has(url.pathname)) return true
  if (RUNTIME_PATH_PREFIXES.some((p) => url.pathname.startsWith(p))) return true
  return RUNTIME_DESTINATIONS.has(req.destination)
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(req)
  if (cached) return cached
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return new Response('', { status: 504, statusText: 'Offline' })
  }
}

async function networkFirstPage(event) {
  try {
    const preloaded = event.preloadResponse ? await event.preloadResponse : null
    if (preloaded) return preloaded
    return await fetch(event.request)
  } catch {
    const cache = await caches.open(STATIC_CACHE)
    const offline = await cache.match(OFFLINE_URL)
    return offline || new Response('Offline', { status: 504 })
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE)
  const cached = await cache.match(req)
  const network = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => cached)
  return cached || network
}

// --- Web Push ---------------------------------------------------------------
// The server sends a JSON payload { title, body, url, tag }. iOS shows these
// only for the home-screen-installed PWA (iOS 16.4+).

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Maple', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Maple'
  const options = {
    body: data.body || '',
    icon: '/icon',
    badge: '/icon',
    tag: data.tag || undefined,
    data: { url: data.url || '/dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/dashboard'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        // Focus an existing window and route it to the target.
        if ('focus' in client) {
          if ('navigate' in client) {
            try {
              await client.navigate(url)
            } catch {
              /* cross-origin or not allowed - just focus */
            }
          }
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })(),
  )
})
