/**
 * Split money across household members by weight. Pure, deterministic,
 * integer cents. Used by the shared-expense actions and the rules engine so
 * "mark shared" and "auto-shared by rule" always agree.
 */

export type WeightedMember = { id: string; weight: number }
export type ShareRow = { member_id: string; amount_cents: number }

/**
 * Largest-remainder apportionment of `totalAbs` cents across members by
 * weight, then the payer's own row is dropped (their portion is the implicit
 * leftover). Members with weight <= 0 are excluded. If the payer is not among
 * the participants, every participant owes.
 *
 * Rounding: floor each exact share, then hand the leftover cents one at a time
 * to the largest fractional parts; ties go to earlier input order, so callers
 * should pass members in a stable order (sort_order).
 */
export function splitByWeights(
  totalAbs: number,
  payerId: string | null,
  members: WeightedMember[],
): ShareRow[] {
  if (!Number.isInteger(totalAbs) || totalAbs < 0) return []
  const seen = new Set<string>()
  const parts = members.filter((m) => {
    if (!m.id || seen.has(m.id) || !(m.weight > 0)) return false
    seen.add(m.id)
    return true
  })
  if (parts.length === 0 || totalAbs === 0) return []

  const W = parts.reduce((s, m) => s + m.weight, 0)
  const exact = parts.map((m) => (totalAbs * m.weight) / W)
  const floors = exact.map((x) => Math.floor(x))
  let leftover = totalAbs - floors.reduce((s, x) => s + x, 0)

  const order = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (leftover <= 0) break
    floors[i] += 1
    leftover -= 1
  }

  return parts
    .map((m, i) => ({ member_id: m.id, amount_cents: floors[i] }))
    .filter((r) => r.member_id !== payerId && r.amount_cents > 0)
}

export function equalWeights(memberIds: string[]): WeightedMember[] {
  return memberIds.map((id) => ({ id, weight: 1 }))
}

/** Percent share per member (0..100, one decimal) for display. */
export function weightsToPercents(members: WeightedMember[]): Map<string, number> {
  const parts = members.filter((m) => m.weight > 0)
  const W = parts.reduce((s, m) => s + m.weight, 0)
  const out = new Map<string, number>()
  for (const m of members) out.set(m.id, W > 0 && m.weight > 0 ? Math.round((m.weight / W) * 1000) / 10 : 0)
  return out
}
