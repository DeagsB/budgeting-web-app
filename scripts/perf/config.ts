// Shared settings for the perf harness. Run every script against a
// production server (`next build && next start`), never `next dev`.
import fs from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')
export const OUT_DIR = path.join(ROOT, '.perf')
// One saved login per engine: cookies exported by WebKit carry
// SameSite=None without Secure, which Chromium refuses to send.
export const statePath = (engine: string) => path.join(OUT_DIR, `state-${engine}.json`)

export const BASE_URL = process.env.PERF_BASE_URL ?? 'http://localhost:3000'
export const CREDS = {
  email: process.env.PERF_EMAIL ?? 'playwright-test@budgeting-app.local',
  password: process.env.PERF_PASSWORD ?? 'Maple-e2e-2026!',
}

// iPhone 12 on a slow 4G link. Lighthouse's "slow 4G" preset is the reference.
export const NETWORK = { rttMs: 150, downKbps: 1600, upKbps: 750 }
export const CPU_THROTTLE = 4
export const RUNS = Number(process.env.PERF_RUNS ?? 5)

// iPhone 12: 390x844 CSS px, DPR 3, iOS 18 Safari UA (standalone PWA).
export const DEVICE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
}

export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : fallback
}

export function ensureOut(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

export function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export function median(xs: number[]): number {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return NaN
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function p75(xs: number[]): number {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!s.length) return NaN
  return s[Math.min(s.length - 1, Math.ceil(0.75 * s.length) - 1)]
}

export function summarize(runs: Record<string, number>[]): Record<string, { median: number; p75: number }> {
  const keys = new Set<string>()
  for (const r of runs) for (const k of Object.keys(r)) keys.add(k)
  const out: Record<string, { median: number; p75: number }> = {}
  for (const k of keys) {
    const xs = runs.map((r) => r[k]).filter((v) => typeof v === 'number')
    out[k] = { median: round(median(xs)), p75: round(p75(xs)) }
  }
  return out
}

export function round(n: number, d = 1): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function writeJson(name: string, data: unknown): string {
  ensureOut()
  const p = path.join(OUT_DIR, name)
  fs.writeFileSync(p, JSON.stringify(data, null, 2))
  return p
}

export function latest(prefix: string, label: string): string | null {
  if (!fs.existsSync(OUT_DIR)) return null
  const files = fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(`${prefix}-${label}-`) && f.endsWith('.json'))
    .sort()
  return files.length ? path.join(OUT_DIR, files[files.length - 1]) : null
}
