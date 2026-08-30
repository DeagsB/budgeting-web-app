import { describe, expect, it } from 'vitest'
import { seriesToPoints, smoothPath } from './maple'

/** Sample a path's `C` segments and return the y-range the curve actually covers. */
function curveYRange(d: string): { min: number; max: number } {
  const nums = (seg: string) => seg.trim().split(/[\s,]+/).map(Number)
  const start = nums(d.slice(1, d.indexOf(' C')))
  let [, y0] = start
  let min = y0
  let max = y0
  for (const seg of d.split('C').slice(1)) {
    const [, c0y, , c1y, , y1] = nums(seg)
    for (let t = 0; t <= 1; t += 0.002) {
      const mt = 1 - t
      const y = mt * mt * mt * y0 + 3 * mt * mt * t * c0y + 3 * mt * t * t * c1y + t * t * t * y1
      if (y < min) min = y
      if (y > max) max = y
    }
    y0 = y1
  }
  return { min, max }
}

describe('smoothPath', () => {
  const H = 150
  const PAD = 10

  it('keeps a step up to a new plateau inside the chart', () => {
    // The reported bug: a big deposit lands, the trail steps up and flattens,
    // and the smoothed curve overshot to y = -10 in a 0..150 viewBox - the
    // peak was sliced off by the top edge. The area fill hid the matching
    // overshoot past the bottom.
    const points = seriesToPoints([0, 0, 0, 0, 100, 100, 100, 100], 640, H, { pad: PAD })
    const { min, max } = curveYRange(smoothPath(points))
    expect(min).toBeGreaterThanOrEqual(PAD - 0.01)
    expect(max).toBeLessThanOrEqual(H - PAD + 0.01)
  })

  it('keeps a trough inside the chart', () => {
    const points = seriesToPoints([100, 100, 100, 0, 100, 100, 100], 640, H, { pad: PAD })
    const { min, max } = curveYRange(smoothPath(points))
    expect(min).toBeGreaterThanOrEqual(PAD - 0.01)
    expect(max).toBeLessThanOrEqual(H - PAD + 0.01)
  })

  it('never leaves the data range, whatever the shape', () => {
    const shapes = [
      [0, 100],
      [10, 20, 30, 40, 100, 30, 20],
      [0, 10, 25, 45, 70, 100],
      [40, 41, 42, 44, 43, 92, 61, 62, 63, 65],
      [5, 5, 5, 5, 5],
    ]
    for (const values of shapes) {
      const points = seriesToPoints(values, 640, H, { pad: PAD })
      const dataMin = Math.min(...points.map((p) => p[1]))
      const dataMax = Math.max(...points.map((p) => p[1]))
      const { min, max } = curveYRange(smoothPath(points))
      expect(min).toBeGreaterThanOrEqual(dataMin - 0.01)
      expect(max).toBeLessThanOrEqual(dataMax + 0.01)
    }
  })

  it('still curves through the points it is given', () => {
    const points = seriesToPoints([0, 10, 25, 45, 70, 100], 640, H, { pad: PAD })
    const d = smoothPath(points)
    expect(d.startsWith(`M${points[0][0]},${points[0][1]}`)).toBe(true)
    // One cubic segment per gap, not a polyline.
    expect(d.split('C').length - 1).toBe(points.length - 1)
  })

  it('returns nothing for fewer than two points', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([[0, 0]])).toBe('')
  })
})
