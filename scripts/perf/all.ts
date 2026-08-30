// Runs the whole harness for one label against an already-running
// production server:  npm run build && npm run start   (other terminal)
//                     npm run perf:all -- --label baseline
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { BASE_URL, arg } from './config.ts'

const label = arg('label', 'baseline')
const route = arg('route', '/dashboard')
const skip = new Set(arg('skip', '').split(',').filter(Boolean))

const ok = await fetch(`${BASE_URL}/sign-in`, { redirect: 'manual' }).then((r) => r.status < 500).catch(() => false)
if (!ok) {
  console.error(`${BASE_URL} not reachable - start the production server first (npm run build && npm run start)`)
  process.exit(1)
}

const steps: [string, string[]][] = [
  ['bundle', []],
  ['webkit', []],
  ['chrome-tbt', []],
  ['lighthouse', []],
]
for (const [name, extra] of steps) {
  if (skip.has(name)) continue
  console.log(`\n=== ${name} ===`)
  const r = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, `${name}.ts`), '--label', label, '--route', route, ...extra],
    { stdio: 'inherit', env: process.env },
  )
  if (r.status !== 0) console.error(`${name} exited ${r.status}`)
}
