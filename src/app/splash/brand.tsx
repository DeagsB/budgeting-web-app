/**
 * Shared brand artwork for every ImageResponse route (app icons, maskable
 * icon, iOS splash screens). Keeping it in one place means the mark on the
 * home screen, the launch screen and the install prompt are the same glyph.
 *
 * Only inline styles: this JSX is rendered by Satori, not the DOM.
 */
import { BRAND_FONT_FAMILY } from './font'

export const LEAF = '#1F5641'
export const LEAF_DEEP = '#154031'
export const PAPER = '#FFFDF7'
export const HONEY = '#D4A574'

const LEAF_PATH =
  'M12 2l1.5 4.5L18 5l-2 4 4 1.5-3.5 3 1.5 4.5L13 16l-1 4-1-4-5 2 1.5-4.5L4 10.5 8 9 6 5l4.5 1.5z'

/**
 * The square icon tile: leaf gradient, faint maple leaf in the corner, serif
 * "M" and a honey underline. `glyphScale` sets the M's size relative to the
 * canvas; the default matches the original 512px icon. The maskable variant
 * uses ~0.55 so the glyph stays inside the 40% safe zone.
 */
export function IconMark({
  size,
  glyphScale = 0.734,
  radius = 0,
}: {
  size: number
  glyphScale?: number
  radius?: number
}) {
  const fontSize = Math.round(size * glyphScale)
  const barW = Math.round(fontSize * 0.28)
  const barH = Math.max(4, Math.round(fontSize * 0.032))
  const leafSize = Math.round(size * 1.13)

  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius,
        backgroundImage: `radial-gradient(circle at 28% 22%, rgba(255,253,247,0.18) 0%, rgba(255,253,247,0) 55%), linear-gradient(135deg, ${LEAF} 0%, ${LEAF_DEEP} 100%)`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -Math.round(size * 0.16),
          right: -Math.round(size * 0.2),
          width: leafSize,
          height: leafSize,
          opacity: 0.08,
          display: 'flex',
        }}
      >
        <svg width={leafSize} height={leafSize} viewBox="0 0 24 24" fill={PAPER}>
          <path d={LEAF_PATH} />
        </svg>
      </div>

      <div
        style={{
          fontFamily: BRAND_FONT_FAMILY,
          fontSize,
          color: PAPER,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          display: 'flex',
        }}
      >
        M
      </div>

      <div
        style={{
          marginTop: Math.round(fontSize * 0.05),
          width: barW,
          height: barH,
          borderRadius: barH / 2,
          background: HONEY,
          display: 'flex',
        }}
      />
    </div>
  )
}

/** iOS launch screens we ship, in CSS pixels + device pixel ratio. */
export const SPLASH_DEVICES = [
  { w: 375, h: 667, dpr: 2 }, // iPhone SE (3rd gen)
  { w: 375, h: 812, dpr: 3 }, // iPhone 13 mini / 12 mini
  { w: 390, h: 844, dpr: 3 }, // iPhone 14 / 13 / 12
  { w: 393, h: 852, dpr: 3 }, // iPhone 14 Pro / 15 / 16
  { w: 402, h: 874, dpr: 3 }, // iPhone 16 Pro
  { w: 428, h: 926, dpr: 3 }, // iPhone 14 Plus / 13 Pro Max
  { w: 430, h: 932, dpr: 3 }, // iPhone 15 Pro Max / 16 Plus
  { w: 440, h: 956, dpr: 3 }, // iPhone 16 Pro Max
] as const

export function splashFileName(d: { w: number; h: number; dpr: number }) {
  return `${d.w * d.dpr}x${d.h * d.dpr}.png`
}

export function splashMedia(d: { w: number; h: number; dpr: number }) {
  return `(device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait)`
}

/**
 * Full-screen launch image: solid leaf so it sits under the translucent
 * status bar in both themes, with the icon tile and the "Maple" wordmark
 * centred. Sized in device pixels.
 */
export function Splash({ width, height }: { width: number; height: number }) {
  const tile = Math.round(width * 0.24)
  const wordSize = Math.round(width * 0.085)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: LEAF,
        backgroundImage: `linear-gradient(180deg, ${LEAF} 0%, ${LEAF_DEEP} 100%)`,
      }}
    >
      <IconMark size={tile} radius={Math.round(tile * 0.22)} />
      <div
        style={{
          marginTop: Math.round(height * 0.03),
          fontFamily: BRAND_FONT_FAMILY,
          fontSize: wordSize,
          fontWeight: 400,
          color: PAPER,
          letterSpacing: '-0.02em',
          lineHeight: 1,
          display: 'flex',
        }}
      >
        Maple
      </div>
    </div>
  )
}
