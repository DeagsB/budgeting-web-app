'use client'

import { useEffect } from 'react'

/**
 * Last-resort boundary: replaces the root layout when it throws, so it must
 * render its own <html>/<body> and cannot rely on globals.css or fonts.
 * Inline styles mirror the Maple cream/ink palette.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F6F1E7',
          color: '#1B1712',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: 'max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom))',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: '100%',
            background: '#FFFCF5',
            border: '1px solid rgba(27,23,18,0.08)',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 6px 24px rgba(27,23,18,0.06)',
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6, margin: 0 }}>
            Maple
          </p>
          <h1 style={{ fontSize: 26, lineHeight: 1.2, margin: '12px 0 8px', fontWeight: 500 }}>
            Something went wrong.
          </h1>
          <p style={{ fontSize: 15, opacity: 0.75, margin: '0 0 20px' }}>
            The app could not load. Your data is safe.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.5, margin: '0 0 16px' }}>
              ref {error.digest}
            </p>
          ) : null}
          <button
            onClick={() => reset()}
            style={{
              height: 46,
              padding: '0 20px',
              borderRadius: 999,
              border: 'none',
              background: '#2F6B3A',
              color: '#FFFCF5',
              fontSize: 14,
              fontWeight: 600,
              width: '100%',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
