import { ImageResponse } from 'next/og'
import { SPLASH_DEVICES, Splash, splashFileName } from '../brand'
import { brandFonts } from '../font'

// iOS launch screens, one per device class, referenced from
// `appleWebApp.startupImage` in src/app/layout.tsx. Prerendered at build time
// for the allow-listed sizes; anything else is a 404. The `.png` suffix keeps
// these outside the auth proxy's matcher so Safari can fetch them cold.
export const dynamic = 'force-static'
export const dynamicParams = false

export function generateStaticParams() {
  return SPLASH_DEVICES.map((d) => ({ size: splashFileName(d) }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  const device = SPLASH_DEVICES.find((d) => splashFileName(d) === size)
  if (!device) return new Response('Not found', { status: 404 })

  const width = device.w * device.dpr
  const height = device.h * device.dpr

  return new ImageResponse(<Splash width={width} height={height} />, {
    width,
    height,
    fonts: await brandFonts(),
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
