import { ImageResponse } from 'next/og'
import { IconMark } from '../splash/brand'
import { brandFonts } from '../splash/font'

// 192px "any" icon for the manifest (Chrome's minimum for the install
// prompt). The `.png` path keeps it outside the auth proxy's matcher.
export const dynamic = 'force-static'

const SIZE = 192

export async function GET() {
  return new ImageResponse(<IconMark size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    fonts: await brandFonts(),
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
