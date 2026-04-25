import { ImageResponse } from 'next/og'

// Standard PWA icon (Android / Chrome installs read this from the manifest).
// Same Maple-branded design as apple-icon.tsx, just rendered at 512px.
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
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundImage:
            'radial-gradient(circle at 28% 22%, rgba(255,253,247,0.18) 0%, rgba(255,253,247,0) 55%), linear-gradient(135deg, #1F5641 0%, #154031 100%)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -100,
            width: 580,
            height: 580,
            opacity: 0.08,
            display: 'flex',
          }}
        >
          <svg width="580" height="580" viewBox="0 0 24 24" fill="#FFFDF7">
            <path d="M12 2l1.5 4.5L18 5l-2 4 4 1.5-3.5 3 1.5 4.5L13 16l-1 4-1-4-5 2 1.5-4.5L4 10.5 8 9 6 5l4.5 1.5z" />
          </svg>
        </div>

        <div
          style={{
            fontFamily: 'serif',
            fontSize: 376,
            color: '#FFFDF7',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            display: 'flex',
          }}
        >
          M
        </div>

        <div
          style={{
            marginTop: 18,
            width: 104,
            height: 12,
            borderRadius: 6,
            background: '#D4A574',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size },
  )
}
