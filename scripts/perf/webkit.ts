// Primary WebKit measurement. Cold load of a route N times in fresh
// contexts (logged in via saved storage state), throttled network, then a
// warm reload in the same context and a scripted scroll.
//
// WebKit cannot CPU-throttle. Main-thread numbers here (rAF gaps) are a
// directional signal only; chrome-tbt.ts is authoritative for TBT.
import zlib from 'node:zlib'
import { webkit, type Page, type Response } from 'playwright'
import { ensureState } from './auth.ts'
import {
  BASE_URL, DEVICE, RUNS, arg, kb, round, stamp, summarize, writeJson,
} from './config.ts'
import { INIT_SCRIPT, NO_VIEW_TRANSITIONS_SCRIPT } from './init-script.ts'
import { throttle } from './throttle.ts'

type Bytes = { count: number; raw: number; gzip: number }
type RunResult = Record<string, number>

const label = arg('label', 'baseline')
const route = arg('route', '/dashboard')
const runs = Number(arg('runs', String(RUNS)))
const noThrottle = process.argv.includes('--no-throttle')
const keepVt = process.argv.includes('--keep-vt')

function typeOf(res: Response): string {
  const url = res.url()
  const ct = res.headers()['content-type'] ?? ''
  const rt = res.request().resourceType()
  if (rt === 'document') return 'html'
  if (ct.includes('text/x-component') || url.includes('_rsc=')) return 'rsc'
  if (rt === 'script' || /\.js(\?|$)/.test(url)) return 'js'
  if (rt === 'stylesheet' || /\.css(\?|$)/.test(url)) return 'css'
  if (rt === 'font' || /\.(woff2?|ttf|otf)(\?|$)/.test(url)) return 'font'
  if (rt === 'image') return 'image'
  if (rt === 'fetch' || rt === 'xhr') return 'fetch'
  return 'other'
}

function trackBytes(page: Page): Record<string, Bytes> {
  const bytes: Record<string, Bytes> = {}
  page.on('response', async (res) => {
    if (!res.url().startsWith(BASE_URL)) return
    let body: Buffer
    try {
      body = await res.body()
    } catch {
      return
    }
    const t = typeOf(res)
    const b = (bytes[t] ??= { count: 0, raw: 0, gzip: 0 })
    b.count++
    b.raw += body.length
    // Fonts/images are already compressed; text assets get gzip -6, which is
    // what `next start` serves and a conservative proxy for Vercel brotli.
    b.gzip += t === 'font' || t === 'image' ? body.length : zlib.gzipSync(body, { level: 6 }).length
  })
  return bytes
}

async function collect(page: Page): Promise<RunResult> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const P = (window as unknown as { __maplePerf: Record<string, unknown> }).__maplePerf
    const mark = (n: string) => {
      const m = performance.getEntriesByName(n)
      return m.length ? m[0].startTime : NaN
    }
    const gaps = P.rafGaps as { start: number; dur: number }[]
    const hydrated = mark('maple:dashboard-hydrated')
    const settleEnd = (Number.isNaN(hydrated) ? mark('maple:shell-hydrated') : hydrated) + 2000
    const loadGaps = gaps.filter((g) => g.start < settleEnd)
    return {
      ttfb: nav ? nav.responseStart : NaN,
      htmlDone: nav ? nav.responseEnd : NaN,
      domContentLoaded: nav ? nav.domContentLoadedEventEnd : NaN,
      load: nav ? nav.loadEventEnd : NaN,
      fcp: P.fcp as number,
      lcp: P.lcp as number,
      heroVisible: P.heroVisible as number,
      shellHydrated: mark('maple:shell-hydrated'),
      dashboardHydrated: hydrated,
      cls: P.cls as number,
      clsApprox: P.clsApprox as number,
      longTasksCount: (P.longTasks as unknown[]).length,
      rafGapsCount: loadGaps.length,
      rafGapsTotalMs: loadGaps.reduce((s, g) => s + g.dur, 0),
      rafGapsMaxMs: loadGaps.reduce((s, g) => Math.max(s, g.dur), 0),
      hydrationWarnings: P.hydrationWarnings as number,
      errors: (P.errors as string[]).length,
    }
  })
}

async function scrollTest(page: Page): Promise<RunResult> {
  await page.evaluate(() => {
    const P = (window as unknown as { __maplePerf: { rafGaps: unknown[] } }).__maplePerf
    P.rafGaps.length = 0
  })
  // Mobile WebKit has no mouse wheel; step the scroll position instead.
  // Programmatic, so it exercises paint/compositing of sticky and fixed
  // layers but not touch momentum.
  const start = Date.now()
  let dir = 1
  while (Date.now() - start < 3000) {
    const atEnd = await page.evaluate((d) => {
      window.scrollBy(0, 120 * d)
      return d > 0
        ? window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
        : window.scrollY <= 0
    }, dir)
    if (atEnd) dir = -dir
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(300)
  return page.evaluate(() => {
    const gaps = (window as unknown as { __maplePerf: { rafGaps: { dur: number }[] } }).__maplePerf.rafGaps
    return {
      scrollGapsCount: gaps.length,
      scrollGapsTotalMs: gaps.reduce((s, g) => s + g.dur, 0),
      scrollGapsMaxMs: gaps.reduce((s, g) => Math.max(s, g.dur), 0),
    }
  })
}

async function main() {
  const state = await ensureState(webkit)
  const browser = await webkit.launch()
  const cold: RunResult[] = []
  const warm: RunResult[] = []
  const scroll: RunResult[] = []
  let lastBytes: Record<string, Bytes> = {}
  const url = `${BASE_URL}${route}`

  for (let i = 0; i < runs; i++) {
    // Cold = true first visit: no service worker, empty HTTP cache.
    const context = await browser.newContext({ ...DEVICE, storageState: state, serviceWorkers: 'block' })
    if (!noThrottle) await throttle(context)
    if (!keepVt) await context.addInitScript(NO_VIEW_TRANSITIONS_SCRIPT)
    await context.addInitScript(INIT_SCRIPT)
    const page = await context.newPage()
    const bytes = trackBytes(page)

    await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
    await page
      .waitForFunction(
        () =>
          performance.getEntriesByName('maple:dashboard-hydrated').length > 0 ||
          performance.getEntriesByName('maple:shell-hydrated').length > 0,
        null,
        { timeout: 60_000 },
      )
      .catch(() => {})
    await page.waitForTimeout(3000)
    const c = await collect(page)
    for (const [t, b] of Object.entries(bytes)) {
      c[`bytes_${t}_raw`] = b.raw
      c[`bytes_${t}_gzip`] = b.gzip
      c[`count_${t}`] = b.count
    }
    c.bytes_total_gzip = Object.values(bytes).reduce((s, b) => s + b.gzip, 0)
    c.bytes_total_raw = Object.values(bytes).reduce((s, b) => s + b.raw, 0)
    cold.push(c)
    lastBytes = bytes

    scroll.push(await scrollTest(page))

    await context.close()

    // Warm = installed PWA relaunch: service worker active + HTTP cache.
    // First visit installs the worker (the registrar reloads once on
    // controllerchange); the second navigation is what we measure.
    const wctx = await browser.newContext({ ...DEVICE, storageState: state })
    if (!noThrottle) await throttle(wctx)
    if (!keepVt) await wctx.addInitScript(NO_VIEW_TRANSITIONS_SCRIPT)
    await wctx.addInitScript(INIT_SCRIPT)
    const wpage = await wctx.newPage()
    await wpage.goto(url, { waitUntil: 'load', timeout: 120_000 })
    await wpage.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 30_000 }).catch(() => {})
    await wpage.waitForTimeout(2000)
    await wpage.goto(url, { waitUntil: 'load', timeout: 120_000 })
    await wpage
      .waitForFunction(() => performance.getEntriesByName('maple:dashboard-hydrated').length > 0 || performance.getEntriesByName('maple:shell-hydrated').length > 0, null, { timeout: 60_000 })
      .catch(() => {})
    await wpage.waitForTimeout(2000)
    const w = await collect(wpage)
    warm.push({ ttfb: w.ttfb, htmlDone: w.htmlDone, fcp: w.fcp, heroVisible: w.heroVisible, dashboardHydrated: w.dashboardHydrated })
    await wctx.close()
    process.stdout.write(`run ${i + 1}/${runs}: ttfb=${round(c.ttfb, 0)} fcp=${round(c.fcp, 0)} hero=${round(c.heroVisible, 0)} hydrated=${round(c.dashboardHydrated, 0)} htmlDone=${round(c.htmlDone, 0)} js=${kb(c.bytes_js_gzip ?? 0)} docs=${c.count_html} gaps=${c.rafGapsCount}\n`)
  }
  await browser.close()

  const result = {
    label, route, runs, throttled: !noThrottle, viewTransitions: keepVt, engine: `webkit ${browser.version()}`,
    note: 'WebKit: startViewTransition stubbed unless --keep-vt (Windows WebKit crashes on it); no CPU throttle, no LCP/CLS/longtask APIs. heroVisible replaces LCP, clsApprox replaces CLS, rafGaps replace long tasks.',
    cold: summarize(cold), warm: summarize(warm), scroll: summarize(scroll),
    bytesLastRun: lastBytes, raw: { cold, warm, scroll },
  }
  const p = writeJson(`webkit-${label}-${stamp()}.json`, result)
  const c = result.cold
  console.log(`\n[webkit ${label} ${route}] medians of ${runs}:`)
  console.log(`  TTFB ${c.ttfb.median}ms  HTML done ${c.htmlDone.median}ms  FCP ${c.fcp.median}ms  hero ${c.heroVisible.median}ms  shell-hydrated ${c.shellHydrated.median}ms  dashboard-hydrated ${c.dashboardHydrated.median}ms`)
  console.log(`  JS ${kb(c.bytes_js_gzip?.median ?? 0)} gz (${c.count_js?.median} files)  CSS ${kb(c.bytes_css_gzip?.median ?? 0)}  fonts ${kb(c.bytes_font_raw?.median ?? 0)} (${c.count_font?.median})  HTML ${kb(c.bytes_html_gzip?.median ?? 0)}  RSC ${kb(c.bytes_rsc_gzip?.median ?? 0)}  total ${kb(c.bytes_total_gzip.median)} gz`)
  console.log(`  rAF gaps>50ms during load: ${c.rafGapsCount.median} (total ${c.rafGapsTotalMs.median}ms, max ${c.rafGapsMaxMs.median}ms)  clsApprox ${c.clsApprox.median}  hydrationWarnings ${c.hydrationWarnings.median}`)
  console.log(`  scroll gaps: ${result.scroll.scrollGapsCount.median} (max ${result.scroll.scrollGapsMaxMs.median}ms)  warm: TTFB ${result.warm.ttfb.median}ms FCP ${result.warm.fcp.median}ms hydrated ${result.warm.dashboardHydrated.median}ms`)
  console.log(`  saved ${p}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
