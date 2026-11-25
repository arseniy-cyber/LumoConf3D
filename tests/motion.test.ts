import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPath, planSideExit, routePosition, sweptHit, type Envelope, type Obstacle, type Vec3 } from '../src/scene/motion.ts'

const box = (min: Vec3, max: Vec3): Envelope => ({ min, max })
const body = box([-.25, -.25, -.5], [.25, .25, .5])
const origin: Vec3 = [.5, 2, 0]
const target: Vec3 = [-2, 2, 0]
const rails: Obstacle[] = [
  { id: 'bottom rail', box: box([-1.1, 0, -2], [-.9, .9, 2]) },
  { id: 'top rail', box: box([-1.1, 3.1, -2], [-.9, 4, 2]) },
  { id: 'front rail', box: box([-1.1, 0, 1.7], [-.9, 4, 2]) },
  { id: 'rear rail', box: box([-1.1, 0, -2], [-.9, 4, -1.7]) },
]
const glass = { id: 'glass', box: box([-1.05, .9, -1.7], [-1, 3.1, 1.7]) }

test('closed panel blocks a continuous extraction even when both sampled endpoints are clear', () => {
  assert.equal(checkPath(body, [origin], [glass]), undefined)
  assert.equal(checkPath(body, [target], [glass]), undefined)
  assert.equal(checkPath(body, [origin, target], [glass])?.id, 'glass')
  assert.equal(planSideExit(body, origin, -1.1, [...rails, glass]).blocked?.id, 'glass')
})

test('open portal passes a complete straight exit and its exact reverse', () => {
  const result = planSideExit(body, origin, -1.1, rails)
  assert.ok(result.route)
  assert.equal(checkPath(body, result.route.points, rails), undefined)
  assert.equal(checkPath(body, [...result.route.points].reverse(), rails), undefined)
  assert.ok(routePosition(result.route, result.route.length)[0] + body.max[0] < -1.1)
})

test('compact opening and long card are rejected rather than scaled down', () => {
  const long = box([-.25, -.25, -1.8], [.25, .25, 1.8])
  assert.ok(planSideExit(long, origin, -1.1, rails).blocked)
})

test('tall cooler and adjacent radiator obstruct the same corridor', () => {
  const tall = box([-.85, -.25, -.7], [.85, 1.15, .7])
  assert.equal(planSideExit(tall, origin, -1.1, rails).blocked?.id, 'top rail')
  const radiator = { id: 'radiator', box: box([-.7, 1.9, -.9], [-.4, 2.4, .9]) }
  assert.equal(planSideExit(body, origin, -1.1, [...rails, radiator]).blocked?.id, 'radiator')
})

test('2 mm clearance is enforced even without overlapping solid volumes', () => {
  const obstacle = box([-1.1, 2.265, -.5], [-.9, 3, .5])
  assert.equal(sweptHit(body, origin, target, obstacle, 0), undefined)
  assert.notEqual(sweptHit(body, origin, target, obstacle), undefined)
})

test('stationary contact, invalid geometry and nonfinite endpoints fail closed', () => {
  assert.equal(sweptHit(body, origin, origin, box([.75, 2, 0], [1, 3, 1]), 0), 0)
  assert.equal(checkPath(box([1, 0, 0], [0, 1, 1]), [origin], [])?.id, 'invalid-geometry')
  assert.equal(checkPath(body, [[NaN, 0, 0]], [])?.id, 'invalid-geometry')
})

test('frame rate and interrupted/reversed playback preserve the checked corridor', () => {
  const { route } = planSideExit(body, origin, -1.1, rails)
  assert.ok(route)
  for (const fps of [15, 30, 60, 144, 1000]) {
    let travelled = 0
    let previous = routePosition(route, 0)
    while (travelled < route.length) {
      travelled = Math.min(route.length, travelled + 2 / fps)
      const next = routePosition(route, travelled)
      assert.equal(checkPath(body, [previous, next], rails), undefined)
      previous = next
    }
    const mid = routePosition(route, route.length * .43)
    assert.equal(checkPath(body, [mid, origin], rails), undefined)
    assert.deepEqual(routePosition(route, 0), origin)
  }
  assert.equal(checkPath(body, [routePosition(route, 0), routePosition(route, route.length)], rails), undefined)
})
