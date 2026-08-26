import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The app's display serif (Instrument Serif, OFL - see fonts/OFL.txt) for the
// ImageResponse routes: splash screens and icons. next/font output is not
// reachable from Satori, so the TTF is vendored and read at build time.
export const BRAND_FONT_FAMILY = 'Instrument Serif'

let cached: Promise<ArrayBuffer> | null = null

function loadBrandFont(): Promise<ArrayBuffer> {
  cached ??= readFile(path.join(process.cwd(), 'src', 'app', 'splash', 'fonts', 'InstrumentSerif-Regular.ttf')).then(
    (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  )
  return cached
}

/** `fonts` option for `new ImageResponse(...)`. */
export async function brandFonts() {
  return [{ name: BRAND_FONT_FAMILY, data: await loadBrandFont(), weight: 400 as const, style: 'normal' as const }]
}
