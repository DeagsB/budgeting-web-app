// Before/after table from the latest saved runs of two labels.
//   node scripts/perf/report.ts --before baseline --after after-fonts
import fs from 'node:fs'
import { arg, latest } from './config.ts'

const before = arg('before', 'baseline')
const after = arg('after', 'final')
const route = arg('route', '/dashboard').replace(/\W+/g, '_')

type Any = Record<string, any>
const load = (prefix: string, label: string): Any | null => {
  const p = latest(prefix, label)
  return p ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

const wb = load('webkit', before), wa = load('webkit', after)
const cb = load('chrome', before), ca = load('chrome', after)
const bb = load(`bundle-${before}`, route) ?? load('bundle', `${before}-${route}`)
const ba = load(`bundle-${after}`, route) ?? load('bundle', `${after}-${route}`)
const lb = latest('lh', before) ? JSON.parse(fs.readFileSync(latest('lh', before)!.replace(/\.json$/, '.summary.json'), 'utf8')) : null
const la = latest('lh', after) ? JSON.parse(fs.readFileSync(latest('lh', after)!.replace(/\.json$/, '.summary.json'), 'utf8')) : null

type Row = [string, number | undefined, number | undefined, string, string]
const rows: Row[] = []
const add = (name: string, b: number | undefined, a: number | undefined, unit = 'ms', target = '') =>
  rows.push([name, b, a, unit, target])
const med = (o: Any | null, path: string): number | undefined =>
  path.split('.').reduce<Any | undefined>((x, k) => (x == null ? undefined : x[k]), o ?? undefined)?.median

add('Dashboard critical JS (brotli)', bb?.js.br, ba?.js.br, 'B', '< 153600')
add('Dashboard critical JS (gzip)', bb?.js.gzip, ba?.js.gzip, 'B')
add('Critical JS files', bb?.js.files, ba?.js.files, '')
add('CSS (brotli)', bb?.css.br, ba?.css.br, 'B')
add('Total transfer cold (gzip est, WebKit)', med(wb, 'cold.bytes_total_gzip'), med(wa, 'cold.bytes_total_gzip'), 'B')
add('Font files', med(wb, 'cold.count_font'), med(wa, 'cold.count_font'), '')
add('Font bytes', med(wb, 'cold.bytes_font_raw'), med(wa, 'cold.bytes_font_raw'), 'B')
add('HTML+RSC bytes (gzip est)', (med(wb, 'cold.bytes_html_gzip') ?? 0) + (med(wb, 'cold.bytes_rsc_gzip') ?? 0), (med(wa, 'cold.bytes_html_gzip') ?? 0) + (med(wa, 'cold.bytes_rsc_gzip') ?? 0), 'B')
add('TTFB (WebKit)', med(wb, 'cold.ttfb'), med(wa, 'cold.ttfb'))
add('FCP (WebKit)', med(wb, 'cold.fcp'), med(wa, 'cold.fcp'))
add('Hero visible (WebKit, LCP proxy)', med(wb, 'cold.heroVisible'), med(wa, 'cold.heroVisible'))
add('Shell hydrated (WebKit)', med(wb, 'cold.shellHydrated'), med(wa, 'cold.shellHydrated'))
add('Dashboard hydrated (WebKit)', med(wb, 'cold.dashboardHydrated'), med(wa, 'cold.dashboardHydrated'))
add('rAF gaps >50ms during load (WebKit)', med(wb, 'cold.rafGapsCount'), med(wa, 'cold.rafGapsCount'), '')
add('rAF gap total ms (WebKit)', med(wb, 'cold.rafGapsTotalMs'), med(wa, 'cold.rafGapsTotalMs'))
add('CLS approx (WebKit)', med(wb, 'cold.clsApprox'), med(wa, 'cold.clsApprox'), '', '< 0.05')
add('Scroll gaps >50ms (WebKit)', med(wb, 'scroll.scrollGapsCount'), med(wa, 'scroll.scrollGapsCount'), '', '0')
add('Warm TTFB (WebKit)', med(wb, 'warm.ttfb'), med(wa, 'warm.ttfb'))
add('Warm hydrated (WebKit)', med(wb, 'warm.dashboardHydrated'), med(wa, 'warm.dashboardHydrated'))
add('Hydration warnings', med(wb, 'cold.hydrationWarnings'), med(wa, 'cold.hydrationWarnings'), '', '0')
add('LCP (Chrome 4x)', med(cb, 'summary.lcp'), med(ca, 'summary.lcp'))
add('Dashboard hydrated (Chrome 4x)', med(cb, 'summary.dashboardHydrated'), med(ca, 'summary.dashboardHydrated'))
add('TBT (Chrome 4x)', med(cb, 'summary.tbt'), med(ca, 'summary.tbt'), 'ms', '< 200')
add('Long tasks (Chrome 4x)', med(cb, 'summary.longTasksCount'), med(ca, 'summary.longTasksCount'), '')
add('Script duration (Chrome 4x)', med(cb, 'summary.scriptDurationMs'), med(ca, 'summary.scriptDurationMs'))
add('CLS (Chrome)', med(cb, 'summary.cls'), med(ca, 'summary.cls'), '')
add('Lighthouse score', lb?.score, la?.score, '')
add('Lighthouse LCP', lb?.lcp, la?.lcp)
add('Lighthouse TBT', lb?.tbt, la?.tbt)
add('Lighthouse Speed Index', lb?.speedIndex, la?.speedIndex)

const fmt = (v: number | undefined, unit: string) => {
  if (v == null || Number.isNaN(v)) return 'n/a'
  if (unit === 'B') return `${(v / 1024).toFixed(1)} KB`
  if (unit === 'ms') return `${Math.round(v)} ms`
  return Number.isInteger(v) ? String(v) : v.toFixed(3)
}
console.log(`| Metric | ${before} | ${after} | Delta | Target |`)
console.log('|---|---|---|---|---|')
for (const [name, b, a, unit, target] of rows) {
  const delta = b != null && a != null && !Number.isNaN(b) && !Number.isNaN(a) && b !== 0
    ? `${a - b >= 0 ? '+' : ''}${fmt(a - b, unit)} (${(((a - b) / b) * 100).toFixed(0)}%)`
    : ''
  console.log(`| ${name} | ${fmt(b, unit)} | ${fmt(a, unit)} | ${delta} | ${target} |`)
}
