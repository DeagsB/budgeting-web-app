// Interaction benchmark: drag across the net-worth chart on /dashboard for
// 2 s at 4x CPU throttle (Chromium) and count dropped frames and long tasks.
// Target: input-to-paint under 200 ms, no frame gap over 50 ms.
import { chromium } from 'playwright'
import { ensureState } from './auth.ts'
import { BASE_URL, CPU_THROTTLE, DEVICE, RUNS, arg, stamp, summarize, writeJson } from './config.ts'
import { INIT_SCRIPT, PWA_SCRIPT } from './init-script.ts'

const label = arg('label', 'baseline')
const runs = Number(arg('runs', String(RUNS)))

async function main() {
  const state = await ensureState(chromium)
  const browser = await chromium.launch()
  const all: Record<string, number>[] = []
  for (let i = 0; i < runs; i++) {
    // Cold = true first visit: no service worker, empty HTTP cache.
    const context = await browser.newContext({ ...DEVICE, storageState: state, serviceWorkers: 'block' })
    await context.addInitScript(PWA_SCRIPT)
    await context.addInitScript(INIT_SCRIPT)
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'load', timeout: 120_000 })
    await page.waitForFunction(() => performance.getEntriesByName('maple:dashboard-hydrated').length > 0, null, { timeout: 60_000 })
    await page.waitForTimeout(2500)
    // The net-worth area chart is the only crosshair-cursor svg on the page.
    const svg = page.locator('svg.cursor-crosshair').first()
    await svg.waitFor({ timeout: 15_000 })
    const box = await svg.boundingBox()
    if (!box) throw new Error('chart not found')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })
    await page.evaluate(() => {
      const P = (window as unknown as { __maplePerf: { rafGaps: unknown[]; longTasks: unknown[] } }).__maplePerf
      P.rafGaps.length = 0
      P.longTasks.length = 0
    })
    // Touch-style horizontal drag, 60 steps each way, ~2 s total.
    const y = box.y + box.height / 2
    await page.mouse.move(box.x + 2, y)
    await page.mouse.down()
    const t0 = Date.now()
    let moves = 0
    for (let pass = 0; pass < 2; pass++) {
      for (let s = 0; s <= 60; s++) {
        const frac = pass === 0 ? s / 60 : 1 - s / 60
        await page.mouse.move(box.x + 2 + frac * (box.width - 4), y)
        moves++
        await page.waitForTimeout(16)
      }
    }
    await page.mouse.up()
    const wall = Date.now() - t0
    const r = await page.evaluate(() => {
      const P = (window as unknown as { __maplePerf: { rafGaps: { dur: number }[]; longTasks: { dur: number }[] } }).__maplePerf
      return {
        rafGapsCount: P.rafGaps.length,
        rafGapsTotalMs: P.rafGaps.reduce((s, g) => s + g.dur, 0),
        rafGapsMaxMs: P.rafGaps.reduce((s, g) => Math.max(s, g.dur), 0),
        longTasksCount: P.longTasks.length,
        longTasksTotalMs: P.longTasks.reduce((s, t) => s + t.dur, 0),
        longTaskMaxMs: P.longTasks.reduce((s, t) => Math.max(s, t.dur), 0),
      }
    })
    all.push({ ...r, moves, wallMs: wall })
    await context.close()
    process.stdout.write(`run ${i + 1}/${runs}: gaps=${r.rafGapsCount} (max ${r.rafGapsMaxMs}ms) longTasks=${r.longTasksCount} (${r.longTasksTotalMs}ms) wall=${wall}ms\n`)
  }
  await browser.close()
  const result = { label, runs, cpuThrottle: CPU_THROTTLE, summary: summarize(all), raw: all }
  const p = writeJson(`scrub-${label}-${stamp()}.json`, result)
  const s = result.summary
  console.log(`\n[scrub ${CPU_THROTTLE}x ${label}] medians of ${runs}: frame gaps>50ms ${s.rafGapsCount.median} (total ${s.rafGapsTotalMs.median}ms, max ${s.rafGapsMaxMs.median}ms)  long tasks ${s.longTasksCount.median} (${s.longTasksTotalMs.median}ms, max ${s.longTaskMaxMs.median}ms)`)
  console.log(`  saved ${p}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
