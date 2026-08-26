import { ImageResponse } from 'next/og'
import { BRAND_FONT_FAMILY, brandFonts } from './splash/font'

// iOS home-screen icon. iOS auto-applies the squircle mask, so we render a
// full-bleed rounded square at the standard 180px and let the OS do the
// chrome. Maple-themed: a warm leaf gradient plus a serif "M" with a
// honey-colored accent underline so the tile reads as branded, not generic.
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default async function AppleIcon() {
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
          // Diagonal leaf gradient (light → deep) with a subtle highlight
          // pin in the upper-left to suggest a glossy, pressable surface.
          backgroundImage:
            'radial-gradient(circle at 28% 22%, rgba(255,253,247,0.18) 0%, rgba(255,253,247,0) 55%), linear-gradient(135deg, #1F5641 0%, #154031 100%)',
          position: 'relative',
        }}
      >
        {/* faint maple leaf glyph behind the M, low opacity so it reads as
            texture, not as a competing element */}
        <div
          style={{
            position: 'absolute',
            top: -28,
            right: -34,
            width: 200,
            height: 200,
            opacity: 0.08,
            display: 'flex',
          }}
        >
          <svg width="200" height="200" viewBox="0 0 24 24" fill="#FFFDF7">
            <path d="M12 2l1.5 4.5L18 5l-2 4 4 1.5-3.5 3 1.5 4.5L13 16l-1 4-1-4-5 2 1.5-4.5L4 10.5 8 9 6 5l4.5 1.5z" />
          </svg>
        </div>

        {/* serif M */}
        <div
          style={{
            fontFamily: BRAND_FONT_FAMILY,
            fontSize: 132,
            color: '#FFFDF7',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            display: 'flex',
            // textShadow not supported by ImageResponse - but the gradient gives
            // enough depth without it.
          }}
        >
          M
        </div>

        {/* honey accent rule beneath the M, evokes the Maple wordmark */}
        <div
          style={{
            marginTop: 6,
            width: 36,
            height: 4,
            borderRadius: 2,
            background: '#D4A574',
            display: 'flex',
          }}
        />
      </div>
    ),
    { ...size, fonts: await brandFonts() },
  )
}
