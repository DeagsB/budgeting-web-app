import { ImageResponse } from 'next/og'

// iOS home-screen icon. iOS auto-applies the squircle mask, so we render a
// flat rounded square at the standard 180px and let the OS do the chrome.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
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
          fontSize: 130,
          letterSpacing: '-0.04em',
          paddingBottom: 8,
        }}
      >
        M
      </div>
    ),
    { ...size },
  )
}
