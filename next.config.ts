import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Lets React's <ViewTransition> (used in the app shell) animate route
    // navigations via the browser View Transitions API. No-op in browsers
    // without support.
    viewTransition: true,
  },
  async headers() {
    return [
      {
        // The service worker must never be cached at the edge — clients need
        // to see new versions promptly so the cached app shell stays current.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        // Manifest is fine to cache for a few minutes — install metadata
        // changes rarely. Long enough to feel snappy, short enough that a
        // theme color tweak ships within the day.
        source: '/manifest.webmanifest',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300' }],
      },
    ]
  },
}

export default nextConfig
