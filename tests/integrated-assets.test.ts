import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, Vector3, type Object3D } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { catalog } from '../src/shared/catalog.ts'

const models = new URL('../public/models/', import.meta.url)
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const size = (object: Object3D) => new Box3().setFromObject(object).getSize(new Vector3()).multiplyScalar(1000)
const assertAxis = (measured: number, expected: number, tolerance = .5) =>
  assert.ok(Math.abs(measured - expected) < tolerance, `expected ${expected} mm, measured ${measured}`)

test('every existing catalog ID has a distinct local GLB with Meshopt, author provenance and renderable geometry', async () => {
  const files = await readdir(models)
  assert.equal(catalog.length, 58)
  assert.equal(files.filter(file => file.endsWith('.glb')).length, 58)
  for (const part of catalog) {
    assert.equal(part.modelUrl, `/models/${part.id}.glb`)
    assert.equal(part.modelStatus, 'approximation')
    const binary = await readFile(new URL(`${part.id}.glb`, models))
    assert.equal(binary.toString('ascii', 0, 4), 'glTF')
    assert.equal(binary.readUInt32LE(4), 2)
    const manifest = JSON.parse(binary.toString('utf8', 20, 20 + binary.readUInt32LE(12)))
    assert.ok(manifest.extensionsRequired.includes('EXT_meshopt_compression'), part.id)
    assert.ok(!manifest.buffers.some((buffer: { uri?: string }) => buffer.uri), part.id)
    assert.ok(!manifest.images?.some((image: { uri?: string }) => image.uri), part.id)
    assert.ok(binary.length < 1_500_000, part.id)
    const { scene } = await loader.parseAsync(Uint8Array.from(binary).buffer, '')
    assert.ok(scene.children[0]?.userData.provenance, part.id)
    assert.ok(size(scene).length() > 0, part.id)
  }
})

for (const part of catalog.filter(item => item.category === 'motherboard')) {
  test(`${part.id} has a calibrated PCB envelope and installation guides`, async () => {
    const bytes = await readFile(new URL(`${part.id}.glb`, models))
    const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '')
    const dimensions = size(scene)
    assertAxis(dimensions.y, Number(part.specs.heightMm))
    assertAxis(dimensions.z, Number(part.specs.widthMm))
    assert.ok(dimensions.x > 15 && dimensions.x < 40)
    assert.ok(scene.getObjectByName('mount-board-origin'))
    assert.ok(scene.getObjectByName('mount-pcie-primary'))
    assert.ok(scene.getObjectByName('mount-m2-0'))
    assert.ok(scene.getObjectByName('mount-rear-io'))
  })
}

for (const part of catalog.filter(item => item.specs.radiatorMm)) {
  test(`${part.id} has separable calibrated pump, radiator, tube ports and rotors`, async () => {
    const bytes = await readFile(new URL(`${part.id}.glb`, models))
    const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '')
    const radiator = scene.getObjectByName('radiator')
    const pump = scene.getObjectByName('pump')
    const shell = radiator?.getObjectByName('radiator-body')
    assert.ok(shell && pump && radiator && part.dimensions)
    const measured = size(shell)
    assertAxis(measured.x, part.dimensions.width)
    assertAxis(measured.y, part.dimensions.height)
    assertAxis(measured.z, part.dimensions.depth)
    for (let i = 0; i < 2; i++) {
      assert.ok(pump.getObjectByName(`tube-pump-${i}`))
      assert.ok(radiator.getObjectByName(`tube-radiator-${i}`))
    }
    for (let i = 0; i < (part.specs.fanCount ?? 0); i++) assert.ok(radiator.getObjectByName(`rotor-${i}`))
  })
}

for (const part of catalog.filter(item => item.category === 'psu' || item.id === 'samsung-870-evo-1tb')) {
  test(`${part.id} has a measured enclosure and installation references`, async () => {
    const bytes = await readFile(new URL(`${part.id}.glb`, models))
    const { scene } = await loader.parseAsync(Uint8Array.from(bytes).buffer, '')
    assert.ok(part.dimensions)
    const { width, height, depth } = part.dimensions
    const actual = size(scene)
    if (part.category === 'storage') {
      assertAxis(actual.x, height)
      assertAxis(actual.y, width)
      assert.ok(scene.getObjectByName('mount-sata-power'))
      assert.ok(scene.getObjectByName('mount-sata-data'))
    } else {
      assertAxis(actual.x, width)
      assertAxis(actual.y, height)
      assert.ok(scene.getObjectByName(part.specs.psuFormFactor === 'SFX' ? 'mount-sfx-psu' : 'mount-atx-psu'))
      assert.ok(scene.getObjectByName('rotor-0'))
    }
    assertAxis(actual.z, depth)
  })
}
