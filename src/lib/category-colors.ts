// Canonical category-color source for Maple.
//
// Keyed to the real DB category names seeded by `seed_default_categories`
// (Housing, Transportation, Food, …). Values are mode-agnostic CSS - either a
// Maple token CSS var (which flips in dark mode) or a raw hex tuned to read
// against both light cream and dark paper without per-mode re-tinting.
//
// Unknown categories (user-created names not in the map) get a deterministic
// hash-indexed palette color instead of a single shared grey, so two distinct
// categories never collapse to the same swatch in charts / legends.

const CATEGORY_COLORS: Record<string, string> = {
  Housing:                'var(--color-leaf)',
  Transportation:         'var(--color-honey)',
  Food:                   'var(--color-maple)',
  Health:                 '#3F8B5C',
  Personal:               'var(--color-berry)',
  Subscriptions:          '#7A8B9C',
  Entertainment:          '#B85A8A',
  'Savings contribution': 'var(--color-leaf-deep)',
  Taxes:                  '#5D4E37',
  'Debt payment':         '#8B2A1C',
  Miscellaneous:          'var(--color-ink-3)',
}

// Fallback palette for categories outside the canonical map. Hand-picked hues
// that hold up on both cream and paper surfaces; ordered to maximise contrast
// between adjacent entries since the hash spreads names across the whole list.
const FALLBACK_PALETTE: readonly string[] = [
  '#C77D3A', // amber
  '#4E7FA6', // steel blue
  '#9B5BA0', // orchid
  '#5C8A4A', // moss
  '#B05544', // clay
  '#3F8B8B', // teal
  '#A6843C', // brass
  '#76609C', // violet
  '#A8516E', // rose
  '#6F8A3C', // olive
  '#566B9C', // indigo
  '#9C6B4E', // cocoa
]

// FNV-1a 32-bit string hash - fast, deterministic, good spread for short keys.
function hashName(name: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * Resolve a CSS color for a category name. Canonical names map to Maple tokens
 * / tuned hexes; any other name is deterministically assigned a palette color
 * so distinct categories stay visually distinct. Empty / nullish names fall
 * back to the neutral ink token.
 */
export function colorForCategory(name: string | null | undefined): string {
  if (!name) return 'var(--color-ink-2)'
  const mapped = CATEGORY_COLORS[name]
  if (mapped) return mapped
  return FALLBACK_PALETTE[hashName(name) % FALLBACK_PALETTE.length]
}
