import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const physical = (
  color: THREE.ColorRepresentation,
  roughness: number,
  metalness: number,
) => new THREE.MeshStandardMaterial({ color, roughness, metalness })

export type LightingMaterial = THREE.MeshStandardMaterial

export class StudioMaterials {
  readonly graphite = physical(0x252730, 0.47, 0.53)
  readonly painted = physical(0x161922, 0.42, 0.44)
  readonly edge = physical(0x3c3f48, 0.38, 0.69)
  readonly zinc = physical(0xa3a8b7, 0.32, 0.75)
  readonly dark = physical(0x0d1017, 0.69, 0.19)
  readonly plastic = physical(0x272b35, 0.64, 0.13)
  readonly blade = physical(0x292c35, 0.47, 0.26)
  readonly diffuser = physical(0x777695, 0.47, 0.1)
  readonly pcb = physical(0x111719, 0.71, 0.23)
  readonly chip = physical(0x272b31, 0.88, 0.05)
  readonly contacts = physical(0xc49a65, 0.47, 0.77)
  readonly copper = physical(0x8c6f56, 0.42, 0.68)
  readonly tube = physical(0x191c24, 0.81, 0.04)
  readonly cable = physical(0x2a2b35, 0.74, 0.12)
  readonly glass = new THREE.MeshPhysicalMaterial({
    color: 0x646d83,
    metalness: 0,
    transparent: true,
    opacity: 0.13,
    roughness: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  readonly mesh = new THREE.MeshStandardMaterial({
    color: 0x080b13,
    roughness: 0.57,
    metalness: 0.49,
    side: THREE.DoubleSide,
    alphaTest: 0.53,
    alphaMap: perforation(),
  })
  readonly labels = new Map<string, THREE.MeshBasicMaterial>()
  readonly textures = new Set<THREE.Texture>()

  constructor() {
    if (this.mesh.alphaMap) this.textures.add(this.mesh.alphaMap)
  }

  light() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x5d5a75,
      emissive: 0xa797ff,
      emissiveIntensity: 1.85,
      roughness: 0.38,
      metalness: 0.14,
    })
    return material
  }

  finish(color: string | undefined) {
    const finish = color?.toLowerCase() ?? ''
    if (!/white|бел|silver|сереб/.test(finish)) return this.painted

    const name = /white|бел/.test(finish) ? 'white' : 'silver'
    return name === 'white' ? this.white : this.silver
  }

  private readonly white = physical(0xbcc0c8, 0.42, 0.35)
  private readonly silver = physical(0x9098a6, 0.4, 0.62)

  label(content: string, color: string, style: 'logo' | 'tech') {
    const key = styleKey(content, color, style)
    let material = this.labels.get(key)
    if (material) return material

    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const context = canvas.getContext('2d')
    if (context) {
      context.textBaseline = 'middle'
      context.textAlign = 'center'
      context.fillStyle = color
      context.font = style === 'logo' ? '750 83px Arial, sans-serif' : '650 72px monospace'
      context.fillText(content, 256, 66, 500)
    }
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.textures.add(map)
    this.labels.set(key, material)
    return material
  }

  dispose() {
    for (const material of Object.values(this)) {
      if (material instanceof THREE.Material) material.dispose()
    }
    for (const material of this.labels.values()) material.dispose()
    for (const texture of this.textures) texture.dispose()
  }
}

function styleKey(content: string, color: string, style: string) {
  return `${style}-${color}-${content}`
}

function perforation() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#fff'
    context.fillRect(0, 0, 128, 128)
    context.fillStyle = '#000'
    for (let row = -1; row < 6; row++) {
      for (let col = -1; col < 6; col++) {
        const x = col * 32 + (row % 2) * 16
        const y = row * 32
        context.beginPath()
        context.arc(x, y, 9.5, 0, Math.PI * 2)
        context.fill()
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 6
  return texture
}

export function box(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  position: [number, number, number],
  radius = 0,
) {
  const [x, y, z] = size
  const geometry = radius > 0
    ? new RoundedBoxGeometry(x, y, z, 1, Math.min(radius, x / 2, y / 2, z / 2))
    : new THREE.BoxGeometry(x, y, z)
  return mesh(parent, geometry, material, position)
}

export function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number] = [0, 0, 0],
) {
  const object = new THREE.Mesh(geometry, material)
  object.position.set(...position)
  parent.add(object)
  return object
}

export function cylinders(
  parent: THREE.Object3D,
  material: THREE.Material,
  radius: number,
  height: number,
  positions: THREE.Vector3[],
  axis: 'x' | 'y' | 'z' = 'y',
) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 10)
  const object = new THREE.InstancedMesh(geometry, material, positions.length)
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    axis === 'z' ? Math.PI / 2 : 0, 0, axis === 'x' ? Math.PI / 2 : 0,
  ))
  const matrix = new THREE.Matrix4()
  const scale = new THREE.Vector3(1, 1, 1)
  positions.forEach((point, index) => {
    matrix.compose(point, rotation, scale)
    object.setMatrixAt(index, matrix)
  })
  object.computeBoundingSphere()
  parent.add(object)
  return object
}

export function stripLabels(
  parent: THREE.Object3D,
  theme: StudioMaterials,
  label: string,
  width: number,
  height: number,
  position: [number, number, number],
  axis: 'side' | 'top' | 'front',
  color = '#d1d4e1',
  style: 'logo' | 'tech' = 'logo',
) {
  const object = mesh(parent, new THREE.PlaneGeometry(width, height), theme.label(label, color, style), position)
  if (axis === 'side') object.rotateY(-Math.PI / 2)
  if (axis === 'top') object.rotateX(-Math.PI / 2)
  object.renderOrder = 3
  return object
}

export function vent(
  parent: THREE.Object3D,
  theme: StudioMaterials,
  width: number,
  height: number,
  times: [number, number],
  position: [number, number, number],
  plane: 'front' | 'side' | 'top' = 'front',
) {
  const geometry = new THREE.PlaneGeometry(width, height)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * times[0], uv.getY(i) * times[1])
  const surface = mesh(parent, geometry, theme.mesh, position)
  if (plane === 'top') surface.rotateX(-Math.PI / 2)
  if (plane === 'side') surface.rotateY(Math.PI / 2)
  return surface
}

export function tubing(
  parent: THREE.Object3D,
  material: THREE.Material,
  points: [number, number, number][],
  radius: number,
  density = 22,
) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)))
  return mesh(parent, new THREE.TubeGeometry(curve, density, radius, 6, false), material)
}

export function radialTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 62)
    gradient.addColorStop(0, 'rgba(0,0,0,0.95)')
    gradient.addColorStop(0.33, 'rgba(0,0,0,.72)')
    gradient.addColorStop(0.64, 'rgba(0,0,0,.31)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 128, 128)
  }
  return new THREE.CanvasTexture(canvas)
}

// Low-resolution linear radiance from three softboxes, reserved for material reflections.
export function studioEnvironment() {
  const width = 128
  const height = 64
  const pixels = new Uint16Array(width * height * 4)
  const surface = new THREE.Vector3()
  const softboxes = [
    { direction: new THREE.Vector3(-.72, .65, .48).normalize(), width: 7, energy: 2.15, tint: [1, .95, .90] },
    { direction: new THREE.Vector3(.68, .23, -.63).normalize(), width: 17, energy: 1.64, tint: [.77, .82, 1] },
    { direction: new THREE.Vector3(-.5, .25, -.87).normalize(), width: 22, energy: .96, tint: [.80, .77, 1] },
  ]
  const toHalf = THREE.DataUtils.toHalfFloat
  for (let y = 0; y < height; y++) {
    const elevation = ((y + .5) / height - .5) * Math.PI
    const sky = Math.sin(elevation)
    const horizon = Math.cos(elevation)
    for (let x = 0; x < width; x++) {
      const azimuth = ((x + .5) / width - .5) * Math.PI * 2
      surface.set(Math.cos(azimuth) * horizon, sky, Math.sin(azimuth) * horizon)
      const offset = (y * width + x) * 4
      const ambient = .074 + Math.max(0, sky) * .105
      const channels = [ambient * .94, ambient * .98, ambient]
      for (const { direction, width: spread, energy, tint } of softboxes) {
        const intensity = energy * Math.exp((surface.dot(direction) - 1) * spread)
        for (let i = 0; i < 3; i++) channels[i] += tint[i] * intensity
      }
      pixels[offset] = toHalf(channels[0])
      pixels[offset + 1] = toHalf(channels[1])
      pixels[offset + 2] = toHalf(channels[2])
      pixels[offset + 3] = toHalf(1)
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.HalfFloatType)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}
