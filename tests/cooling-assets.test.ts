import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, Vector3 } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const cooling = [
  { id: 'arctic-p12-pwm-pst', axes: [120, 120, 25], fans: 1, rgb: false },
  { id: 'arctic-p14-pwm-pst', axes: [140, 140, 27], fans: 1, rgb: false },
  { id: 'noctua-nf-a12x25-pwm', axes: [120, 120, 25], fans: 1, rgb: false },
  { id: 'corsair-ar120-rgb', axes: [120, 120, 25], fans: 1, rgb: true },
  { id: 'arctic-p12-pwm-pst-argb', axes: [120, 120, 25], fans: 1, rgb: true },
  { id: 'deepcool-ak400', axes: [155, 127, 97], fans: 1, rgb: false, cooler: true },
  { id: 'thermalright-peerless-assassin-120-se', axes: [155, 125, 135], fans: 2, rgb: false, cooler: true },
  { id: 'noctua-nh-d15-chromax-black', axes: [168, 150, 161], fans: 2, rgb: false, cooler: true },
]
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

for (const item of cooling) {
  test(`GLB ${item.id} verifies envelope, mounting datum, independent fan rotors and RGB support`, async () => {
    const binary = await readFile(new URL(`../public/models/${item.id}.glb`, import.meta.url))
    assert.ok(binary.length < 175 * 1024)
    const manifest = JSON.parse(binary.toString('utf8', 20, 20 + binary.readUInt32LE(12)))
    assert.ok(manifest.extensionsRequired.includes('EXT_meshopt_compression'))
    assert.ok(!manifest.buffers.some((buffer: { uri?: string }) => buffer.uri))
    assert.ok(!manifest.images?.some((image: { uri?: string }) => image.uri))
    const { scene } = await loader.parseAsync(Uint8Array.from(binary).buffer, '')
    assert.ok(scene.children[0]?.userData.provenance)
    const actual = new Box3().setFromObject(scene).getSize(new Vector3()).multiplyScalar(1000)
    item.axes.forEach((expected, axis) => {
      assert.ok(Math.abs(actual.getComponent(axis) - expected) < 0.6, `axis ${axis}, expected ${expected}, measured ${actual.getComponent(axis)}`)
    })
    for (let i = 0; i < item.fans; i++) assert.ok(scene.getObjectByName(`rotor-${i}`))
    assert.ok(scene.getObjectByName(item.cooler ? 'mount-cpu' : 'mount-screw'))
    const hasRgb = (manifest.materials as {name: string}[]).some(material => material.name.startsWith('rgb-emitter'))
    assert.equal(hasRgb, item.rgb)
  })
}
