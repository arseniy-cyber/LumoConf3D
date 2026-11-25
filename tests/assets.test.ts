import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, Mesh, Vector3 } from 'three'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const packages: Record<string, [number | null, number, number]> = {
  'amd-ryzen-5-5600': [null, 40, 40],
  'amd-ryzen-5-7600': [null, 40, 40],
  'amd-ryzen-7-5700x': [null, 40, 40],
  'amd-ryzen-7-7700x': [null, 40, 40],
  'amd-ryzen-7-7800x3d': [null, 40, 40],
  'amd-ryzen-7-9800x3d': [null, 40, 40],
  'intel-core-i5-12400f': [null, 37.5, 45],
  'intel-core-i5-13400f': [null, 37.5, 45],
  'intel-core-i5-13600k': [null, 37.5, 45],
  'intel-core-i7-14700k': [null, 37.5, 45],
  'asus-dual-rtx4070-super-oc': [133.94, 51.13, 267.01],
  'nzxt-h5-flow-2024': [225, 465, 430],
  'corsair-rm850e-2023': [150, 86, 140],
  'samsung-990-pro-2tb': [2.3, 22, 80],
}

const internalNodes: Record<string, string[]> = {
  'asus-dual-rtx4070-super-oc': ['rotor-0', 'rotor-1', 'mount-pcie-slot', 'connector-12v-16pin'],
  'nzxt-h5-flow-2024': ['glass', 'front-panel', 'top-panel', 'right-panel', 'mount-rear-fan'],
  'corsair-rm850e-2023': ['rotor-0', 'mount-atx-psu'],
  'samsung-990-pro-2tb': ['mount-m2-edge', 'mount-m2-post'],
}

const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

for (const [id, expected] of Object.entries(packages)) {
  test(`GLB ${id} decodes, avoids external resources and fits its package`, async () => {
    const contents = await readFile(new URL(`../public/models/${id}.glb`, import.meta.url))
    assert.equal(contents.toString('ascii', 0, 4), 'glTF')
    assert.equal(contents.readUInt32LE(4), 2)
    assert.equal(contents.readUInt32LE(8), contents.length)
    assert.ok(contents.length < 512 * 1024, 'single packed asset budget')
    const manifest = JSON.parse(contents.toString('utf8', 20, 20 + contents.readUInt32LE(12)))
    assert.ok(manifest.extensionsRequired.includes('EXT_meshopt_compression'))
    assert.ok(!manifest.buffers.some((buffer: { uri?: string }) => buffer.uri))
    assert.ok(!manifest.images?.some((image: { uri?: string }) => image.uri))

    const parsed = await gltf.parseAsync(Uint8Array.from(contents).buffer, '')
    assert.ok(parsed.scene.children[0]?.userData.provenance)
    const bounds = new Box3().setFromObject(parsed.scene)
    const actual = bounds.getSize(new Vector3()).multiplyScalar(1000).toArray()
    expected.forEach((millimeters, axis) => {
      assert.ok(Number.isFinite(actual[axis]))
      if (millimeters !== null) assert.ok(Math.abs(actual[axis] - millimeters) < 0.25, `axis ${axis} measured ${actual[axis]} mm, expected ${millimeters} mm`)
    })

    for (const name of internalNodes[id] ?? ['mount-socket-face', 'mount-heatsink-face']) {
      assert.ok(parsed.scene.getObjectByName(name), `named node ${name}`)
    }

    if (id === 'nzxt-h5-flow-2024') {
      const glass = parsed.scene.getObjectByName('glass')
      assert.ok(glass?.children.some(child => child instanceof Mesh && child.material.transparent))
    }
  })
}

test('catalog photos and original preview renders are local WebP files', async () => {
  const images = [
    'amd-ryzen-5-7600', 'amd-ryzen-7-5700x', 'amd-ryzen-7-7700x', 'amd-ryzen-7-7800x3d',
    'asus-dual-rtx4070-super-oc', 'corsair-4000d-airflow', 'nvidia-rtx4090-fe', 'nzxt-h5-flow-2024',
  ]
  const credits = await readFile(new URL('../public/asset-credits.html', import.meta.url), 'utf8')
  for (const id of images) {
    const bytes = await readFile(new URL(`../public/images/parts/${id}.webp`, import.meta.url))
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
    assert.ok(credits.includes(id))
  }
})
