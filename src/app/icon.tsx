import { ImageResponse } from 'next/og'

// Standard PWA icon (Android / Chrome installs read this from the manifest).
// iOS uses apple-icon.tsx; favicon.ico still lives next to this file.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1F5641',
          fontFamily: 'serif',
          color: '#FFFDF7',
          fontSize: 360,
          letterSpacing: '-0.04em',
          // Visually centred — the serif M's optical baseline sits low.
          paddingBottom: 24,
        }}
      >
        M
      </div>
    ),
    { ...size },
  )
}
