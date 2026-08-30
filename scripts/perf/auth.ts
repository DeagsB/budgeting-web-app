// Signs the perf user in once and persists cookies to .perf/state.json so
// the measurement scripts never include the login flow in their numbers.
import fs from 'node:fs'
import { webkit, type BrowserType } from 'playwright'
import { BASE_URL, CREDS, DEVICE, ensureOut, statePath } from './config.ts'

const MAX_AGE_MS = 60 * 60 * 1000

export async function ensureState(browserType: BrowserType = webkit, force = false): Promise<string> {
  ensureOut()
  const STATE_PATH = statePath(browserType.name())
  if (!force && fs.existsSync(STATE_PATH)) {
    const age = Date.now() - fs.statSync(STATE_PATH).mtimeMs
    if (age < MAX_AGE_MS) return STATE_PATH
  }
  const browser = await browserType.launch()
  const context = await browser.newContext(DEVICE)
  const page = await context.newPage()
  // networkidle: the form is a server action, so the click must land after hydration.
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.fill('input[name=email]', CREDS.email)
  await page.fill('input[name=password]', CREDS.password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 60_000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await context.storageState({ path: STATE_PATH })
  await browser.close()
  return STATE_PATH
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  ensureState(webkit, true)
    .then((p) => console.log(`state saved: ${p}`))
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
}
