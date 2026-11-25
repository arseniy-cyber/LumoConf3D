import type { Session } from './auth'
import { requireRole } from './auth'
import type { AppEnv } from './environment'
import { fail, json, readLimited } from './http'
import { audit, type Store } from './store'

const imageMimes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const modelMime = 'model/gltf-binary'

function imageSize(mime: string, bytes: Uint8Array): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 25) return null
  if (mime === 'image/png') {
    const valid = view.getUint32(0) === 0x89504e47 && view.getUint32(4) === 0x0d0a1a0a
      && view.getUint32(8) === 13 && view.getUint32(12) === 0x49484452
      && view.getUint32(bytes.length - 8) === 0x49454e44
    return valid ? [view.getUint32(16), view.getUint32(20)] : null
  }
  if (mime === 'image/webp') {
    if (view.getUint32(0) !== 0x52494646 || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(8) !== 0x57454250) return null
    const format = view.getUint32(12)
    if (format === 0x56503858 && bytes.length >= 30) {
      if (bytes[20] & 0x02) return null
      return [1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16), 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16)]
    }
    if (format === 0x5650384c && bytes[20] === 0x2f) {
      const size = view.getUint32(21, true)
      return [1 + (size & 0x3fff), 1 + ((size >> 14) & 0x3fff)]
    }
    if (format === 0x56503820 && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff]
    }
    return null
  }
  if (mime !== 'image/jpeg' || view.getUint16(0) !== 0xffd8 || view.getUint16(bytes.length - 2) !== 0xffd9) return null
  let cursor = 2
  while (cursor + 4 <= bytes.length && bytes[cursor] === 0xff) {
    const marker = bytes[cursor + 1]
    if (marker === 0xff) {
      cursor++
      continue
    }
    const length = view.getUint16(cursor + 2)
    if (length < 2 || cursor + 2 + length > bytes.length || marker === 0xda) return null
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      return [view.getUint16(cursor + 7), view.getUint16(cursor + 5)]
    }
    cursor += 2 + length
  }
  return null
}

function validImage(mime: string, bytes: Uint8Array): boolean {
  const size = imageSize(mime, bytes)
  if (!size) return false
  const [width, height] = size
  return width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 16_777_216
}

function structure(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function safeGraph(value: unknown, allowedExtensions: Set<string>, budget: { count: number }, depth = 0): boolean {
  if (--budget.count < 0 || depth > 25) return false
  if (Array.isArray(value)) return value.every(item => safeGraph(item, allowedExtensions, budget, depth + 1))
  if (!structure(value)) return typeof value !== 'number' || Number.isFinite(value)
  for (const [key, entry] of Object.entries(value)) {
    if (['uri', 'url', '__proto__', 'constructor', 'prototype'].includes(key.toLowerCase())) return false
    if (key === 'extensions' && (!structure(entry) || Object.keys(entry).some(name => !allowedExtensions.has(name)))) return false
    if (!safeGraph(entry, allowedExtensions, budget, depth + 1)) return false
  }
  return true
}

function dataList(value: unknown, maximum: number): Record<string, unknown>[] | null {
  if (value === undefined) return []
  return Array.isArray(value) && value.length <= maximum && value.every(structure) ? value : null
}

function nonnegative(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= maximum
}

const meshopt = 'EXT_meshopt_compression'
const modelExtensions = new Set([
  meshopt, 'KHR_mesh_quantization', 'KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_emissive_strength',
  'KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_clearcoat', 'KHR_materials_specular',
])
const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]])
const typeComponents = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]])

function meshoptExtension(value: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!structure(value.extensions)) return undefined
  const extension = value.extensions[meshopt]
  if (structure(extension)) return extension
  return undefined
}

function validCompressed(value: Record<string, unknown>, binLength: number, outputLength: number): boolean {
  const start = value.byteOffset ?? 0
  const offsetLength = value.byteLength
  const stride = value.byteStride
  const count = value.count
  if (value.buffer !== 0 || !nonnegative(start, binLength) || !nonnegative(offsetLength, binLength - start)
    || !offsetLength || !nonnegative(stride, 256) || !stride || !nonnegative(count, 1_000_000) || count * stride !== outputLength) return false
  const mode = value.mode
  const filter = value.filter ?? 'NONE'
  if (mode === 'TRIANGLES' && count % 3 !== 0) return false
  if (mode === 'TRIANGLES' || mode === 'INDICES') return (stride === 2 || stride === 4) && filter === 'NONE'
  if (mode !== 'ATTRIBUTES' || stride % 4) return false
  if (filter === 'OCTAHEDRAL') return stride === 4 || stride === 8
  if (filter === 'QUATERNION') return stride === 8
  return filter === 'NONE' || filter === 'EXPONENTIAL'
}

function validModel(bytes: Uint8Array): boolean {
  if (bytes.length < 24) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) return false
  const jsonSize = view.getUint32(12, true)
  const endJson = 20 + jsonSize
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonSize % 4 || jsonSize > 256 * 1024 || endJson > bytes.length) return false
  let data: unknown
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes.subarray(20, endJson)))
  } catch {
    return false
  }
  let binLength = 0
  const binStart = endJson + 8
  if (bytes.length > endJson) {
    if (binStart > bytes.length) return false
    binLength = view.getUint32(endJson, true)
    if (binLength % 4 || view.getUint32(endJson + 4, true) !== 0x004e4942 || binStart + binLength !== bytes.length) return false
  }
  if (!structure(data) || !structure(data.asset) || data.asset.version !== '2.0' || !safeGraph(data, modelExtensions, { count: 50_000 })) return false
  for (const type of ['extensionsUsed', 'extensionsRequired']) {
    const names = data[type]
    if (names !== undefined && (!Array.isArray(names) || names.some(name => !modelExtensions.has(name)))) return false
  }
  const buffers = dataList(data.buffers, 2)
  const views = dataList(data.bufferViews, 2048)
  const accessors = dataList(data.accessors, 1500)
  const images = dataList(data.images, 20)
  const nodes = dataList(data.nodes, 512)
  const scenes = dataList(data.scenes, 16)
  const meshes = dataList(data.meshes, 300)
  const animations = dataList(data.animations, 32)
  if (!buffers || !views || !accessors || !images || !nodes || !scenes || !meshes || !animations || !meshes.length || !scenes.length) return false
  const padded = buffers[0]?.byteLength ?? 0
  if (!nonnegative(padded, binLength) || binLength - padded > 3) return false
  const fallbackLength = buffers[1]?.byteLength ?? 0
  if (buffers[1] && (!Array.isArray(data.extensionsRequired) || !data.extensionsRequired.includes(meshopt)
      || meshoptExtension(buffers[1])?.fallback !== true || !nonnegative(fallbackLength, 12 * 1024 * 1024))) return false
  let uncompressedBytes = 0
  for (const item of views) {
    const offset = item.byteOffset ?? 0
    const limit = item.buffer === 0 ? padded : item.buffer === 1 ? fallbackLength : -1
    if (typeof limit !== 'number' || !nonnegative(offset, limit) || !nonnegative(item.byteLength, limit - offset) || !item.byteLength) return false
    if (item.byteStride !== undefined && (!nonnegative(item.byteStride, 252) || item.byteStride < 4 || item.byteStride % 4)) return false
    const compression = meshoptExtension(item)
    if (item.buffer === 1 && !compression) return false
    if (compression && !validCompressed(compression, padded, item.byteLength)) return false
    uncompressedBytes += item.byteLength
    if (uncompressedBytes > 12 * 1024 * 1024) return false
  }
  let decodedBytes = 0
  for (const accessor of accessors) {
    const offset = accessor.byteOffset ?? 0
    const count = accessor.count
    const component = componentBytes.get(Number(accessor.componentType))
    const components = typeComponents.get(String(accessor.type))
    if (!component || !components || !nonnegative(count, 1_000_000) || !nonnegative(offset, 12 * 1024 * 1024)
      || !nonnegative(accessor.bufferView, views.length - 1) || accessor.sparse) return false
    const stride = Number(views[accessor.bufferView].byteStride ?? component * components)
    const required = offset + Math.max(0, count - 1) * stride + component * components
    if (offset % component || stride < component * components || required > Number(views[accessor.bufferView].byteLength)) return false
    decodedBytes += count * component * components
    if (decodedBytes > 12 * 1024 * 1024) return false
  }
  let imagePixels = 0
  for (const image of images) {
    const mime = image.mimeType
    if (typeof mime !== 'string' || !imageMimes.has(mime) || !nonnegative(image.bufferView, views.length - 1)) return false
    const item = views[image.bufferView]
    if (item.buffer !== 0 || meshoptExtension(item)) return false
    const start = binStart + Number(item.byteOffset ?? 0)
    const size = imageSize(mime, bytes.subarray(start, start + Number(item.byteLength)))
    if (!size || !size[0] || !size[1] || Math.max(...size) > 8192) return false
    imagePixels += size[0] * size[1]
    if (imagePixels > 16_777_216) return false
  }
  const parents = new Set<number>()
  for (const node of nodes) {
    if (node.mesh !== undefined && !nonnegative(node.mesh, meshes.length - 1)) return false
    if (node.children !== undefined) {
      if (!Array.isArray(node.children) || node.children.length > nodes.length) return false
      for (const child of node.children) {
        if (!nonnegative(child, nodes.length - 1) || parents.has(child)) return false
        parents.add(child)
      }
    }
  }
  const visited = new Set<number>()
  function visit(index: number, path: Set<number>): boolean {
    if (path.has(index)) return false
    if (visited.has(index)) return true
    path.add(index)
    for (const child of (nodes?.[index].children ?? []) as number[]) if (!visit(child, path)) return false
    path.delete(index)
    visited.add(index)
    return true
  }
  for (let index = 0; index < nodes.length; index++) if (!visit(index, new Set())) return false
  if (data.scene !== undefined && !nonnegative(data.scene, scenes.length - 1)) return false
  for (const scene of scenes) {
    if (scene.nodes !== undefined && (!Array.isArray(scene.nodes) || scene.nodes.some(index => !nonnegative(index, nodes.length - 1)))) return false
  }
  for (const mesh of meshes) {
    const primitives = dataList(mesh.primitives, 32)
    if (!primitives?.length) return false
    for (const item of primitives) {
      if (!structure(item.attributes) || !nonnegative(item.attributes.POSITION, accessors.length - 1)
        || Object.values(item.attributes).some(index => !nonnegative(index, accessors.length - 1))
        || item.indices !== undefined && !nonnegative(item.indices, accessors.length - 1)) return false
    }
  }
  return true
}

export async function uploadMedia(request: Request, env: AppEnv, store: Store, actor: Session): Promise<Response> {
  requireRole(actor, 'owner', 'manager')
  const mime = request.headers.get('Content-Type')?.trim().toLowerCase()
  if (!mime || (!imageMimes.has(mime) && mime !== modelMime)) return fail(415, 'media_type', 'Выберите GLB, JPEG, PNG или WebP.')
  const bytes = await readLimited(request, mime === modelMime ? 1_500_000 : 500_000)
  if (!(mime === modelMime ? validModel(bytes) : validImage(mime, bytes))) {
    return fail(422, 'media_structure', 'Файл не прошёл проверку структуры или размеров.')
  }
  const id = crypto.randomUUID()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO media (store_id,id,mime,data) VALUES (?,?,?,?)')
      .bind(store.id, id, mime, bytes.buffer),
    audit(env, store, actor.user.id, 'upload_media', id),
  ])
  return json({ url: `/api/media/${id}?store=${store.slug}`, mime }, 201)
}

export async function getMedia(request: Request, env: AppEnv, store: Store, id: string): Promise<Response> {
  const result = await env.DB.prepare('SELECT mime,data FROM media WHERE store_id=? AND id=?')
    .bind(store.id, id).first<{ mime: string; data: number[] | ArrayBuffer }>()
  if (!result) return fail(404, 'media', 'Файл не найден.')
  const content = Array.isArray(result.data) ? Uint8Array.from(result.data) : new Uint8Array(result.data)
  return new Response(request.method === 'HEAD' ? null : content, {
    headers: {
      'Content-Type': result.mime,
      'Content-Length': String(content.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
