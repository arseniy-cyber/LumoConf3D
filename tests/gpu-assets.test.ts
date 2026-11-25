import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Box3, Mesh, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { catalog } from '../src/shared/catalog.ts'

const gpus = [
  ['asus-dual-rtx4060-oc', 2, ['connector-pcie-8pin-0']],
  ['asus-dual-rtx4060-ti-oc', 2, ['connector-pcie-8pin-0']],
  ['asus-tuf-rtx4070-ti-super-oc', 3, ['connector-12v-16pin']],
  ['asus-tuf-rtx4080-super-oc', 3, ['connector-12v-16pin']],
  ['nvidia-rtx4090-fe', 2, ['connector-12v-16pin']],
  ['sapphire-pulse-rx6600', 2, ['connector-pcie-8pin-0']],
  ['sapphire-pulse-rx7600', 2, ['connector-pcie-8pin-0']],
  ['sapphire-pulse-rx7700-xt', 2, ['connector-pcie-8pin-0', 'connector-pcie-8pin-1']],
  ['sapphire-pulse-rx7800-xt', 2, ['connector-pcie-8pin-0', 'connector-pcie-8pin-1']],
] as const

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

for (const [id, fans, connectors] of gpus) {
  test(`GLB ${id} fits catalog dimensions and has its specified rotors and power connectors`, async () => {
    const part = catalog.find(candidate => candidate.id === id)
    assert.ok(part?.dimensions)
    const content = await readFile(new URL(`../public/models/${id}.glb`, import.meta.url))
    assert.ok(content.byteLength < 512 * 1024)
    assert.equal(content.toString('ascii', 0, 4), 'glTF')
    assert.equal(content.readUInt32LE(4), 2)
    const manifest = JSON.parse(content.toString('utf8', 20, 20 + content.readUInt32LE(12)))
    assert.ok(manifest.extensionsRequired?.includes('EXT_meshopt_compression'))
    assert.ok(!manifest.buffers.some((buffer: { uri?: string }) => buffer.uri))
    assert.ok(!manifest.images?.some((image: { uri?: string }) => image.uri))

    const { scene } = await loader.parseAsync(Uint8Array.from(content).buffer, '')
    const { depth, height, width } = part.dimensions
    const dimensions = [height, depth, width]
    const measured = new Box3().setFromObject(scene).getSize(new Vector3()).multiplyScalar(1000).toArray()
    measured.forEach((value, axis) => {
      assert.ok(Math.abs(value - dimensions[axis]) < .25, `axis ${axis}: ${value} mm / ${dimensions[axis]} mm`)
    })
    assert.ok(scene.children[0]?.userData.provenance)
    for (const name of ['mount-pcie-slot', 'mount-io-bracket', ...connectors]) {
      assert.ok(scene.getObjectByName(name), name)
    }
    for (let index = 0; index < fans; index++) {
      const rotor = scene.getObjectByName(`rotor-${index}`)
      assert.ok(rotor?.children.some(child => child instanceof Mesh))
    }
    assert.ok(!scene.getObjectByName(`rotor-${fans}`))
    if (id === 'nvidia-rtx4090-fe') {
      const first = scene.getObjectByName('rotor-0')?.getWorldPosition(new Vector3())
      const second = scene.getObjectByName('rotor-1')?.getWorldPosition(new Vector3())
      assert.ok(first && second && first.y < 0 && second.y > 0)
    }
  })
}
