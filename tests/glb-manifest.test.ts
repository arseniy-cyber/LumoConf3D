import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { catalog } from '../src/shared/catalog.ts'

type Manifest = {
  asset: { version: string }
  nodes: { name?: string; children?: number[]; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[]
  meshes: { primitives: { attributes: Record<string, number> }[] }[]
  accessors: { min?: number[]; max?: number[]; count: number }[]
  buffers: { uri?: string }[]
  images?: { uri?: string }[]
  extensionsRequired?: string[]
}

// This intentionally does not claim to decode Meshopt or prove assembled fit.
for (const part of catalog) test(`manifest ${part.id}: local container, finite geometry metadata and mount markers`, () => {
  const data = readFileSync(new URL(`../public/models/${part.id}.glb`, import.meta.url))
  assert.equal(data.toString('ascii', 0, 4), 'glTF')
  assert.equal(data.readUInt32LE(4), 2)
  assert.equal(data.readUInt32LE(8), data.length)
  const length = data.readUInt32LE(12)
  assert.equal(data.toString('ascii', 16, 20), 'JSON')
  assert.ok(length > 0 && length + 20 <= data.length)
  const glb = JSON.parse(data.toString('utf8', 20, 20 + length)) as Manifest
  assert.equal(glb.asset.version, '2.0')
  assert.ok(glb.extensionsRequired?.includes('EXT_meshopt_compression'))
  assert.ok(glb.buffers.every(buffer => !buffer.uri))
  assert.ok(!glb.images?.some(image => image.uri))
  assert.ok(glb.meshes.length > 0)
  for (const node of glb.nodes) {
    for (const vector of [node.translation, node.rotation, node.scale, node.matrix]) assert.ok(!vector || vector.every(Number.isFinite))
    for (const child of node.children ?? []) assert.ok(Number.isInteger(child) && child >= 0 && child < glb.nodes.length)
    if (node.mesh !== undefined) assert.ok(Number.isInteger(node.mesh) && node.mesh >= 0 && node.mesh < glb.meshes.length)
  }
  for (const mesh of glb.meshes) for (const primitive of mesh.primitives) {
    const bounds = glb.accessors[primitive.attributes.POSITION]
    assert.ok(bounds?.count > 0)
    assert.ok(bounds.min?.length === 3 && bounds.max?.length === 3)
    assert.ok(bounds.min!.every((value, axis) => Number.isFinite(value) && Number.isFinite(bounds.max![axis]) && value <= bounds.max![axis]))
  }
  const names = new Set(glb.nodes.map(node => node.name))
  if (part.category === 'case') for (const name of ['glass', 'front-panel', 'top-panel', 'right-panel', 'mount-mainboard-datum']) assert.ok(names.has(name), name)
  if (part.category === 'gpu') for (const name of ['mount-pcie-slot', 'mount-io-bracket']) assert.ok(names.has(name), name)
  if (part.category === 'motherboard') for (const name of ['mount-board-origin', 'mount-pcie-primary', 'mount-cpu-socket']) assert.ok(names.has(name), name)
  if (part.specs.radiatorMm) for (const name of ['pump', 'radiator', 'tube-pump-0', 'tube-pump-1', 'tube-radiator-0', 'tube-radiator-1']) assert.ok(names.has(name), name)
})
