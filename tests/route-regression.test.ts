import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkPath, distance, planPortalExit, routePosition, routeSlice, sweptHit, type Envelope, type Route, type Vec3 } from '../src/scene/motion.ts'

const body: Envelope = { min: [-.1, -.1, -.1], max: [.1, .1, .1] }
const origin: Vec3 = [.5, 1, 0]
const obstacle = { id: 'rail', box: { min: [-.8, .87, -.13], max: [-.6, 1.13, .13] } as Envelope }

test('detour preserves a visible gap through each leg and exact reverse', () => {
  const result = planPortalExit(body, origin, -1, [obstacle])
  assert.ok(result.route)
  assert.ok(result.route.points.length > 2)
  assert.equal(checkPath(body, result.route.points, [obstacle]), undefined)
  assert.equal(checkPath(body, routeSlice(result.route, result.route.length, 0), [obstacle]), undefined)
  assert.ok(routePosition(result.route, result.route.length)[0] + body.max[0] < -1)
})

test('closed panel and mounted interference cannot be bypassed by offsets', () => {
  const closed = { id: 'panel', box: { min: [-.8, -2, -2], max: [-.6, 4, 2] } as Envelope }
  assert.equal(planPortalExit(body, origin, -1, [closed]).blocked?.id, 'panel')
  const seated = { id: 'socket', box: { min: [.45, .9, -.1], max: [.6, 1.1, .1] } as Envelope }
  assert.equal(planPortalExit(body, origin, -1, [seated]).blocked?.id, 'socket')
})

test('partial route verification keeps the corner rather than taking a collision-prone chord', () => {
  const route: Route = { points: [[0, 0, 0], [0, 2, 0], [2, 2, 0]], length: 4 }
  const wall = { id: 'diagonal obstacle', box: { min: [.8, .8, -.2], max: [1.2, 1.2, .2] } as Envelope }
  const points = routeSlice(route, .5, 3.5)
  assert.deepEqual(points, [[0, .5, 0], [0, 2, 0], [1.5, 2, 0]])
  assert.ok(checkPath(body, [points[0], points[2]], [wall]))
  assert.equal(checkPath(body, points, [wall]), undefined)
  assert.deepEqual(routeSlice(route, 3.5, .5), [...points].reverse())
  assert.ok(checkPath(body, routeSlice(route, NaN, 1), []))
})

test('1000 deterministic swept-volume cases: thin obstacles, reverse, gap, all three axes', () => {
  let state = 0x12345678
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32 }
  for (let i = 0; i < 1000; i++) {
    const axis = i % 3, other = (axis + 1) % 3
    const from = [0, 0, 0] as [number, number, number]
    const to = [0, 0, 0] as [number, number, number]
    to[axis] = 3 + random() * 10
    const x = .25 + random() * (to[axis] - .5)
    const min = [-.05, -.05, -.05] as [number, number, number]
    const max = [.05, .05, .05] as [number, number, number]
    min[axis] = x; max[axis] = x + .00001 + random() * .005
    const collides = i % 2 === 0
    min[other] = collides ? .11 : .13; max[other] = .2
    const box = { min, max }
    const hit = sweptHit(body, from, to, box)
    const reverse = sweptHit(body, to, from, box)
    assert.equal(hit !== undefined, collides, `case ${i}`)
    assert.equal(reverse !== undefined, collides, `reverse ${i}`)
    if (collides) assert.ok(Math.abs(hit! - (x - .12) / to[axis]) < 1e-10)
    const route = { points: [from, to], length: distance(from, to) }
    const cut = route.length * random()
    assert.deepEqual(routeSlice(route, route.length, cut), routeSlice(route, cut, route.length).reverse())
  }
})
