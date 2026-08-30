// Which (font family, weight, style) pairs are actually rendered on the
// main routes. Ground truth before trimming next/font weights.
import { webkit } from 'playwright'
import { ensureState } from './auth.ts'
import { BASE_URL, DEVICE, arg } from './config.ts'
import { NO_VIEW_TRANSITIONS_SCRIPT } from './init-script.ts'

const routes = arg('routes', '/dashboard,/transactions,/budgets,/accounts,/shared,/pnl').split(',')

async function main() {
  const state = await ensureState(webkit)
  const browser = await webkit.launch()
  const context = await browser.newContext({ ...DEVICE, storageState: state })
  await context.addInitScript(NO_VIEW_TRANSITIONS_SCRIPT)
  const page = await context.newPage()
  const seen = new Map<string, Set<string>>()
  for (const route of routes) {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle', timeout: 90_000 })
    await page.waitForTimeout(800)
    const pairs = await page.evaluate(() => {
      const out = new Set<string>()
      for (const el of document.querySelectorAll('body *')) {
        if (!(el instanceof HTMLElement) || !el.innerText?.trim()) continue
        const cs = getComputedStyle(el)
        const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim()
        out.add(`${fam} | ${cs.fontWeight} | ${cs.fontStyle}`)
      }
      return [...out]
    })
    for (const p of pairs) (seen.get(p) ?? seen.set(p, new Set()).get(p)!).add(route)
  }
  await browser.close()
  console.log('rendered (family | weight | style) -> routes')
  for (const [k, v] of [...seen.entries()].sort()) console.log(`  ${k}  <- ${[...v].join(' ')}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
