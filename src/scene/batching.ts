import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** Batch opaque procedural detail inside each independent moving group. */
export function batchDetails(group: THREE.Group, movable: ReadonlySet<THREE.Object3D> = new Set()) {
  if (movable.has(group)) return
  const groups = new Map<string, THREE.Mesh[]>()
  for (const child of group.children) {
    if (child instanceof THREE.Group) batchDetails(child, movable)
    if (
      !(child instanceof THREE.Mesh) ||
      child instanceof THREE.InstancedMesh ||
      movable.has(child) ||
      Array.isArray(child.material) ||
      child.material.transparent ||
      child.renderOrder !== 0 ||
      !child.visible
    ) continue
    const key = [
      child.material.uuid,
      Number(child.receiveShadow),
      Number(child.castShadow),
      Number(Boolean(child.geometry.index)),
      ...Object.keys(child.geometry.attributes).sort(),
    ].join(':')
    const products = groups.get(key) ?? []
    products.push(child)
    groups.set(key, products)
  }

  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue
    const geometry = meshes.map((part) => {
      part.updateMatrix()
      return part.geometry.clone().applyMatrix4(part.matrix)
    })
    const merged = mergeGeometries(geometry, false)
    for (const item of geometry) item.dispose()
    if (!merged) continue
    const product = new THREE.Mesh(merged, meshes[0].material)
    product.castShadow = meshes[0].castShadow
    product.receiveShadow = meshes[0].receiveShadow
    product.matrixAutoUpdate = false
    group.add(product)
    for (const part of meshes) {
      part.geometry.dispose()
      part.removeFromParent()
    }
  }
}
