/** Continuous collision checks for fixed-orientation translation, in scene units (100 mm/unit).
 * All envelopes must conservatively contain the corresponding geometry. A rejected
 * route is not evidence of physical incompatibility: coarse envelopes can overblock.
 */
export type Vec3 = readonly [number, number, number]
export interface Envelope { min: Vec3; max: Vec3 }
export interface Obstacle { id: string; box: Envelope }
export interface Collision { id: string; segment: number; at: number }
export const SERVICE_CLEARANCE = .02 // 2 mm

const axes = [0, 1, 2] as const
const tuple = (fn: (axis: 0 | 1 | 2) => number): Vec3 => [fn(0), fn(1), fn(2)]
export const add = (a: Vec3, b: Vec3): Vec3 => tuple(i => a[i] + b[i])
export const sub = (a: Vec3, b: Vec3): Vec3 => tuple(i => a[i] - b[i])
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(...sub(a, b))
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => tuple(i => a[i] + (b[i] - a[i]) * t)
const finite = (v: Vec3) => v.every(Number.isFinite)
export const validEnvelope = (box: Envelope) => finite(box.min) && finite(box.max) && axes.every(i => box.min[i] <= box.max[i])

/** Time of first intersection with the obstacle expanded by the required gap.
 * Slab intersection in configuration space, not sampling animation frames.
 * The moving envelope is relative to its translation origin, not its center.
 * Contact at the gap boundary is conservatively blocked, including at endpoints.
 */
export function sweptHit(body: Envelope, from: Vec3, to: Vec3, obstacle: Envelope, clearance = SERVICE_CLEARANCE): number | undefined {
  if (!validEnvelope(body) || !validEnvelope(obstacle) || !finite(from) || !finite(to) || !Number.isFinite(clearance) || clearance < 0) return 0
  let enter = 0
  let exit = 1
  for (const i of axes) {
    const low = obstacle.min[i] - clearance - body.max[i]
    const high = obstacle.max[i] + clearance - body.min[i]
    const delta = to[i] - from[i]
    if (delta === 0) {
      if (from[i] < low || from[i] > high) return undefined
      continue
    }
    const a = (low - from[i]) / delta
    const b = (high - from[i]) / delta
    enter = Math.max(enter, Math.min(a, b))
    exit = Math.min(exit, Math.max(a, b))
    if (enter > exit) return undefined
  }
  return enter <= exit ? enter : undefined
}

export function checkPath(body: Envelope, points: readonly Vec3[], obstacles: readonly Obstacle[], clearance = SERVICE_CLEARANCE): Collision | undefined {
  if (!validEnvelope(body) || !points.length || points.some(p => !finite(p)) || !Number.isFinite(clearance) || clearance < 0) {
    return { id: 'invalid-geometry', segment: 0, at: 0 }
  }
  // Also check a stationary pose, including a one-point path.
  const segments = Math.max(1, points.length - 1)
  for (let i = 0; i < segments; i++) {
    let first: Collision | undefined
    for (const obstacle of obstacles) {
      const at = sweptHit(body, points[i], points[i + 1] ?? points[i], obstacle.box, clearance)
      if (at !== undefined && (!first || at < first.at)) first = { id: obstacle.id, segment: i, at }
    }
    if (first) return first
  }
  return undefined
}

export type Route = { points: readonly Vec3[]; length: number }
export type RouteResult = { route: Route; blocked?: never } | { route?: never; blocked: Collision }

/** Straight exit through the negative-X side. Never invent a portal, ignore a panel,
 * or treat the nominal exterior dimensions as proof that the opening is unobstructed.
 * No rotations or mounting-contact exceptions are currently supported.
 */
export function planSideExit(body: Envelope, start: Vec3, exteriorX: number, obstacles: readonly Obstacle[], clearance = SERVICE_CLEARANCE): RouteResult {
  if (!Number.isFinite(exteriorX) || !validEnvelope(body) || !finite(start)) return { blocked: { id: 'invalid-geometry', segment: 0, at: 0 } }
  const end: Vec3 = [Math.min(start[0], exteriorX - body.max[0] - clearance - .15), start[1], start[2]]
  const points = [start, end]
  const blocked = checkPath(body, points, obstacles, clearance)
  return blocked ? { blocked } : { route: { points, length: distance(start, end) } }
}

/** Position at a distance along the route; reverse uses the exact same segments.
 * Oversized frame deltas are harmless when callers hold all other geometry fixed.
 */
export function routePosition(route: Route, travelled: number): Vec3 {
  let remaining = Math.max(0, Math.min(route.length, travelled))
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i]
    const span = distance(a, b)
    if (span > 0 && remaining <= span) return lerp(a, b, remaining / span)
    remaining -= span
  }
  return route.points[route.points.length - 1]
}
