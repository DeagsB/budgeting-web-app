import { ImageResponse } from 'next/og'
import { IconMark } from '../splash/brand'
import { brandFonts } from '../splash/font'

// Maskable icon: Android crops up to 20% off each edge, so the glyph is
// scaled to ~55% of the canvas and sits on a solid fill that survives any
// mask shape. The `.png` path keeps it outside the auth proxy's matcher.
export const dynamic = 'force-static'

const SIZE = 512

export async function GET() {
  return new ImageResponse(<IconMark size={SIZE} glyphScale={0.55} />, {
    width: SIZE,
    height: SIZE,
    fonts: await brandFonts(),
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
