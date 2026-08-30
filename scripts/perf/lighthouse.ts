// Lighthouse mobile run with simulated slow-4G + 4x CPU, authenticated via
// the cookies in .perf/state.json. Chrome-only; used for LCP/TBT/CLS/SI and
// the opportunity audits (unused JS/CSS, cache TTL, compression).
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { ensureState } from './auth.ts'
import { BASE_URL, CPU_THROTTLE, NETWORK, OUT_DIR, arg, ensureOut, stamp } from './config.ts'

const label = arg('label', 'baseline')
const route = arg('route', '/dashboard')

async function main() {
  const statePath = await ensureState(chromium)
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { cookies: { name: string; value: string }[] }
  const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join('; ')

  const chrome = await chromeLauncher.launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox'],
  })
  try {
    const result = await lighthouse(`${BASE_URL}${route}`, {
      port: chrome.port,
      output: ['json', 'html'],
      logLevel: 'error',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3, disabled: false },
      throttlingMethod: 'simulate',
      throttling: {
        rttMs: NETWORK.rttMs,
        throughputKbps: NETWORK.downKbps,
        requestLatencyMs: NETWORK.rttMs * 3.75,
        downloadThroughputKbps: NETWORK.downKbps * 0.9,
        uploadThroughputKbps: NETWORK.upKbps * 0.9,
        cpuSlowdownMultiplier: CPU_THROTTLE,
      },
      extraHeaders: { Cookie: cookie },
      disableStorageReset: true,
    })
    if (!result) throw new Error('lighthouse returned nothing')
    ensureOut()
    const base = path.join(OUT_DIR, `lh-${label}-${stamp()}`)
    const [json, html] = result.report as string[]
    fs.writeFileSync(`${base}.json`, json)
    fs.writeFileSync(`${base}.html`, html)
    const a = result.lhr.audits
    const num = (id: string) => a[id]?.numericValue ?? NaN
    const summary = {
      score: Math.round((result.lhr.categories.performance.score ?? 0) * 100),
      ttfb: num('server-response-time'),
      fcp: num('first-contentful-paint'),
      lcp: num('largest-contentful-paint'),
      tbt: num('total-blocking-time'),
      cls: num('cumulative-layout-shift'),
      speedIndex: num('speed-index'),
      totalBytes: num('total-byte-weight'),
      unusedJsBytes: (a['unused-javascript']?.details as { overallSavingsBytes?: number } | undefined)?.overallSavingsBytes ?? 0,
      unusedCssBytes: (a['unused-css-rules']?.details as { overallSavingsBytes?: number } | undefined)?.overallSavingsBytes ?? 0,
      bootupMs: num('bootup-time'),
      mainThreadMs: num('mainthread-work-breakdown'),
      fontDisplayOk: a['font-display']?.score,
      cacheTtlOk: a['uses-long-cache-ttl']?.score,
      textCompressionOk: a['uses-text-compression']?.score,
      finalUrl: result.lhr.finalDisplayedUrl,
    }
    fs.writeFileSync(`${base}.summary.json`, JSON.stringify(summary, null, 2))
    console.log(`[lighthouse ${label} ${route}] score ${summary.score}  TTFB ${Math.round(summary.ttfb)}ms  FCP ${Math.round(summary.fcp)}ms  LCP ${Math.round(summary.lcp)}ms  TBT ${Math.round(summary.tbt)}ms  CLS ${summary.cls.toFixed(3)}  SI ${Math.round(summary.speedIndex)}ms`)
    console.log(`  bytes ${(summary.totalBytes / 1024).toFixed(0)}KB  unused JS ${(summary.unusedJsBytes / 1024).toFixed(0)}KB  unused CSS ${(summary.unusedCssBytes / 1024).toFixed(0)}KB  bootup ${Math.round(summary.bootupMs)}ms  main-thread ${Math.round(summary.mainThreadMs)}ms`)
    console.log(`  font-display ${summary.fontDisplayOk}  cache-ttl ${summary.cacheTtlOk}  compression ${summary.textCompressionOk}  final ${summary.finalUrl}`)
    console.log(`  saved ${base}.{json,html}`)
  } finally {
    await chrome.kill()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
