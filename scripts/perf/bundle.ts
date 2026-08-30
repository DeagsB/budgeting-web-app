// Per-route client JS/CSS sizes from a production build. Run after
// `next build`. No analyzer dependency: Turbopack builds do not support
// @next/bundle-analyzer, and the manifest has what we need.
//
// Critical path for a route = chunks of the root layout + every layout on
// the path + the page itself. Brotli quality 11 is what a CDN serves for
// immutable static assets; gzip -6 is what `next start` serves locally.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ROOT, arg, kb, stamp, writeJson } from './config.ts'

const BUDGET_BR = 150 * 1024
const label = arg('label', 'baseline')
const routeArg = arg('route', '/dashboard')

// Next 16 + Turbopack: no app-build-manifest.json. The route's client
// chunks come from build-manifest.json (rootMainFiles) plus the route's
// page_client-reference-manifest.js (entryJSFiles + clientModules chunks).
const nextDir = path.join(ROOT, '.next')
const buildManifestPath = path.join(nextDir, 'build-manifest.json')
const routesPath = path.join(nextDir, 'app-path-routes-manifest.json')
if (!fs.existsSync(buildManifestPath) || !fs.existsSync(routesPath)) {
  console.error('no production build in .next - run `npm run build` first')
  process.exit(1)
}
const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf8')) as { rootMainFiles: string[]; polyfillFiles: string[] }
const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8')) as Record<string, string>

function sizes(file: string) {
  const buf = fs.readFileSync(path.join(nextDir, file))
  return {
    raw: buf.length,
    gzip: zlib.gzipSync(buf, { level: 6 }).length,
    br: zlib.brotliCompressSync(buf, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length },
    }).length,
    text: buf.toString('utf8'),
  }
}

// Which source files a chunk contains, from Turbopack module ids left in
// the output ("[project]/src/...").
function attribute(text: string): string[] {
  const hits = new Set<string>()
  for (const m of text.matchAll(/\[project\]\/(src\/[^"'\s\]]+)/g)) hits.add(m[1])
  for (const m of text.matchAll(/\[project\]\/(node_modules\/(?:@[^/]+\/)?[^/"'\s\]]+)/g)) hits.add(m[1])
  return [...hits]
}

type RscManifest = {
  clientModules: Record<string, { chunks: string[]; async: boolean }>
  entryJSFiles: Record<string, string[]>
  entryCSSFiles: Record<string, { path: string; inlined: boolean }[]>
}

function chunksForRoute(route: string): { keys: string[]; files: Map<string, string[]> } {
  const pageKey = Object.entries(routes).find(([, r]) => r === route)?.[0]
  if (!pageKey) throw new Error(`route ${route} not in app-path-routes-manifest; have: ${Object.values(routes).join(', ')}`)
  const manifestFile = path.join(nextDir, 'server', 'app', ...pageKey.replace(/\/page$/, '').split('/').filter(Boolean), 'page_client-reference-manifest.js')
  const src = fs.readFileSync(manifestFile, 'utf8')
  const m = src.match(/globalThis\.__RSC_MANIFEST\[[^\]]+\]\s*=\s*/)
  if (!m || m.index == null) throw new Error(`cannot parse ${manifestFile}`)
  const rsc = JSON.parse(src.slice(m.index + m[0].length).replace(/;?\s*$/, '')) as RscManifest
  const files = new Map<string, string[]>()
  const push = (f: string, owner: string) => {
    const norm = f.replace(/^\/_next\//, '')
    const list = files.get(norm) ?? []
    if (!list.includes(owner)) list.push(owner)
    files.set(norm, list)
  }
  for (const f of buildManifest.rootMainFiles) push(f, 'root-main')
  const entryKey = `[project]/src/app${pageKey}`
  for (const f of rsc.entryJSFiles[entryKey] ?? []) push(f, 'entry')
  for (const c of rsc.entryCSSFiles[entryKey] ?? []) push(c.path, 'entry-css')
  for (const [mod, v] of Object.entries(rsc.clientModules)) {
    if (v.async) continue
    const short = mod.replace('[project]/', '').replace(/ <module evaluation>$/, '')
    for (const f of v.chunks) push(f, short)
  }
  return { keys: [pageKey, ...Object.keys(rsc.entryJSFiles)], files }
}

const { keys, files } = chunksForRoute(routeArg)
const chunks = new Map<string, ReturnType<typeof sizes> & { owners: string[]; modules: string[] }>()
for (const [f, owners] of files) {
  const s = sizes(f)
  chunks.set(f, { ...s, owners, modules: /\.js$/.test(f) ? attribute(s.text) : [] })
}

const rows = [...chunks.entries()].map(([file, c]) => ({
  file, kind: /\.css$/.test(file) ? 'css' : 'js', raw: c.raw, gzip: c.gzip, br: c.br, owners: c.owners,
  topModules: c.modules.filter((m) => m.startsWith('src/')).slice(0, 12),
  packages: [...new Set(c.modules.filter((m) => m.startsWith('node_modules/')).map((m) => m.replace('node_modules/', '')))],
})).sort((a, b) => b.br - a.br)

const total = (kind: string, key: 'raw' | 'gzip' | 'br') => rows.filter((r) => r.kind === kind).reduce((s, r) => s + r[key], 0)
const result = {
  label, route: routeArg, keys, budgetBr: BUDGET_BR,
  js: { raw: total('js', 'raw'), gzip: total('js', 'gzip'), br: total('js', 'br'), files: rows.filter((r) => r.kind === 'js').length },
  css: { raw: total('css', 'raw'), gzip: total('css', 'gzip'), br: total('css', 'br'), files: rows.filter((r) => r.kind === 'css').length },
  chunks: rows,
}
const p = writeJson(`bundle-${label}-${routeArg.replace(/\W+/g, '_')}-${stamp()}.json`, result)

console.log(`[bundle ${label} ${routeArg}] page ${keys[0]}; ${files.size} files on the critical path`)
console.log(`  JS  ${result.js.files} files  raw ${kb(result.js.raw)}  gzip ${kb(result.js.gzip)}  brotli ${kb(result.js.br)}  budget ${kb(BUDGET_BR)}  ${result.js.br > BUDGET_BR ? 'OVER by ' + kb(result.js.br - BUDGET_BR) : 'under by ' + kb(BUDGET_BR - result.js.br)}`)
console.log(`  CSS ${result.css.files} files  raw ${kb(result.css.raw)}  gzip ${kb(result.css.gzip)}  brotli ${kb(result.css.br)}`)
console.log('  chunks by brotli size:')
for (const r of rows) {
  const owner =
    r.owners.slice(0, 3).map((o) => o.replace(/^src\/app\//, '').replace(/^node_modules\//, 'npm:')).join(', ') +
    (r.owners.length > 3 ? ` +${r.owners.length - 3}` : '')
  console.log(`    ${kb(r.br).padStart(9)} br ${kb(r.gzip).padStart(9)} gz ${kb(r.raw).padStart(9)} raw  ${r.file}  [${owner}]`)
  if (r.topModules.length) console.log(`              src: ${r.topModules.join(', ')}`)
  if (r.packages.length) console.log(`              pkg: ${r.packages.join(', ')}`)
}
console.log(`  saved ${p}`)
if (result.js.br > BUDGET_BR && process.argv.includes('--strict')) process.exit(2)
