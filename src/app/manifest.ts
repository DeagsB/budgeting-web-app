import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Maple - household budgeting',
    short_name: 'Maple',
    description: 'Multi-member household budgeting with Canadian tax-advantaged accounts.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F1E7',
    theme_color: '#F6F1E7',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/app-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Padded variant: glyph inside the 40% safe zone so Android's
        // circle / squircle masks never clip the M.
        src: '/app-icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  }
}
