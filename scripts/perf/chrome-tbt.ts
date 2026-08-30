// Chromium + CDP: the only place we can throttle CPU. Authoritative for
// TBT, long tasks and script execution time. Same login, same init script.
import { chromium, type Page } from 'playwright'
import { ensureState } from './auth.ts'
import {
  BASE_URL, CPU_THROTTLE, DEVICE, NETWORK, RUNS, arg, round, stamp, summarize, writeJson,
} from './config.ts'
import { INIT_SCRIPT, PWA_SCRIPT } from './init-script.ts'

const label = arg('label', 'baseline')
const route = arg('route', '/dashboard')
const runs = Number(arg('runs', String(RUNS)))

async function measure(page: Page): Promise<Record<string, number>> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: NETWORK.rttMs,
    downloadThroughput: (NETWORK.downKbps * 1000) / 8,
    uploadThroughput: (NETWORK.upKbps * 1000) / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'load', timeout: 120_000 })
  await page
    .waitForFunction(
      () => performance.getEntriesByName('maple:dashboard-hydrated').length > 0 ||
        performance.getEntriesByName('maple:shell-hydrated').length > 0,
      null,
      { timeout: 90_000 },
    )
    .catch(() => {})
  await page.waitForTimeout(3000)

  const metrics = await cdp.send('Performance.getMetrics')
  const m = Object.fromEntries(metrics.metrics.map((x) => [x.name, x.value]))

  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const P = (window as unknown as { __maplePerf: Record<string, unknown> }).__maplePerf
    const mark = (n: string) => {
      const e = performance.getEntriesByName(n)
      return e.length ? e[0].startTime : NaN
    }
    const hydrated = mark('maple:dashboard-hydrated')
    const tti = (Number.isNaN(hydrated) ? mark('maple:shell-hydrated') : hydrated) + 2000
    const fcp = P.fcp as number
    const tasks = (P.longTasks as { start: number; dur: number }[]).filter((t) => t.start >= fcp && t.start < tti)
    return {
      ttfb: nav.responseStart,
      fcp,
      lcp: P.lcp as number,
      heroVisible: P.heroVisible as number,
      shellHydrated: mark('maple:shell-hydrated'),
      dashboardHydrated: hydrated,
      cls: P.cls as number,
      tbt: tasks.reduce((s, t) => s + Math.max(0, t.dur - 50), 0),
      longTasksCount: tasks.length,
      longTaskMaxMs: tasks.reduce((s, t) => Math.max(s, t.dur), 0),
      hydrationWarnings: P.hydrationWarnings as number,
    }
  })
  return {
    ...r,
    scriptDurationMs: (m.ScriptDuration ?? 0) * 1000,
    taskDurationMs: (m.TaskDuration ?? 0) * 1000,
    layoutDurationMs: (m.LayoutDuration ?? 0) * 1000,
    styleDurationMs: (m.RecalcStyleDuration ?? 0) * 1000,
    jsHeapMB: (m.JSHeapUsedSize ?? 0) / 1048576,
  }
}

async function main() {
  const state = await ensureState(chromium)
  const browser = await chromium.launch()
  const all: Record<string, number>[] = []
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ ...DEVICE, storageState: state })
    await context.addInitScript(PWA_SCRIPT)
    await context.addInitScript(INIT_SCRIPT)
    const page = await context.newPage()
    const r = await measure(page)
    all.push(r)
    await context.close()
    process.stdout.write(`run ${i + 1}/${runs}: fcp=${round(r.fcp, 0)} lcp=${round(r.lcp, 0)} hydrated=${round(r.dashboardHydrated, 0)} tbt=${round(r.tbt, 0)} script=${round(r.scriptDurationMs, 0)}ms\n`)
  }
  await browser.close()
  const result = {
    label, route, runs, cpuThrottle: CPU_THROTTLE, network: NETWORK,
    engine: `chromium ${browser.version()}`, summary: summarize(all), raw: all,
  }
  const p = writeJson(`chrome-${label}-${stamp()}.json`, result)
  const s = result.summary
  console.log(`\n[chrome ${CPU_THROTTLE}x ${label} ${route}] medians of ${runs}:`)
  console.log(`  TTFB ${s.ttfb.median}ms  FCP ${s.fcp.median}ms  LCP ${s.lcp.median}ms  hero ${s.heroVisible.median}ms  dashboard-hydrated ${s.dashboardHydrated.median}ms`)
  console.log(`  TBT ${s.tbt.median}ms  long tasks ${s.longTasksCount.median} (max ${s.longTaskMaxMs.median}ms)  script ${s.scriptDurationMs.median}ms  layout ${s.layoutDurationMs.median}ms  style ${s.styleDurationMs.median}ms  CLS ${s.cls.median}  heap ${s.jsHeapMB.median}MB`)
  console.log(`  saved ${p}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
