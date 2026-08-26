import { ImageResponse } from 'next/og'
import { IconMark } from '../splash/brand'

// 192px "any" icon for the manifest (Chrome's minimum for the install
// prompt). The `.png` path keeps it outside the auth proxy's matcher.
export const dynamic = 'force-static'

const SIZE = 192

export function GET() {
  return new ImageResponse(<IconMark size={SIZE} />, {
    width: SIZE,
    height: SIZE,
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
