import { ImageResponse } from 'next/og'
import { IconMark } from './splash/brand'

// Standard PWA icon (Android / Chrome installs read this from the manifest).
// Same Maple mark as apple-icon.tsx, rendered at 512px. The 192px and
// maskable variants live under /app-icon-192.png and /app-icon-maskable.png.
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(<IconMark size={size.width} />, { ...size })
}
