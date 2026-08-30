// Network throttling for Playwright WebKit, which has no CDP. Every
// sub-resource request is delayed by half the RTT before it leaves and half
// after the response arrives, plus a bandwidth cost proportional to the
// body size.
//
// Document requests are passed through natively after one RTT so the
// browser's own navigation timing (responseStart = TTFB, responseEnd = last
// byte of the streamed HTML) stays real. The HTML is ~15 KB compressed, so
// skipping its bandwidth cost changes nothing material.
//
// This models latency and serial bandwidth only: no TCP slow start, no
// connection contention, no HTTP/2 prioritization. Good enough for A/B
// deltas on the same harness; do not read the absolute values as device
// truth.
import type { BrowserContext } from 'playwright'
import { NETWORK } from './config.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function throttle(context: BrowserContext, net = NETWORK): Promise<void> {
  const half = net.rttMs / 2
  const bytesPerMs = (net.downKbps * 1000) / 8 / 1000
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() === 'document') {
      await sleep(net.rttMs)
      return route.continue()
    }
    await sleep(half)
    let response
    try {
      response = await route.fetch()
    } catch {
      return route.abort()
    }
    const body = await response.body()
    await sleep(half + body.length / bytesPerMs)
    await route.fulfill({ response, body })
  })
}
