import * as THREE from 'three'
import type { FanMount, MountLocation, Part, SceneOptions } from '../shared/types'
import { resolveRadiatorLocation } from '../shared/compatibility'
import {
  StudioMaterials, box, cylinders, mesh, stripLabels, tubing, vent, type LightingMaterial,
} from './studio'

export interface CaseDimensions {
  width: number
  height: number
  depth: number
  left: number
  tray: number
  floor: number
  top: number
  back: number
  front: number
  pan: number
  boardY: number
  boardZ: number
  verticalPsu: boolean
}

export interface Rotor {
  node: THREE.Object3D
  axis: 'x' | 'y' | 'z'
  location?: MountLocation
}

export interface ModelLights {
  material: LightingMaterial
  location?: MountLocation
}

export interface AssetMount {
  name: 'pump' | 'radiator'
  target: THREE.Group
  size: [number, number, number]
  center: [number, number, number]
}

export interface ModelDetail {
  root: THREE.Group
  rotors: Rotor[]
  lights: ModelLights[]
  glass?: THREE.Object3D
  dimensions?: [number, number, number]
  mounts?: AirMount[]
  fanUnits?: { root: THREE.Group; location: MountLocation }[]
  assetMounts?: AssetMount[]
  updateTubes?: (pump: THREE.Vector3[], radiator: THREE.Vector3[]) => void
  finishMaterials?: THREE.MeshStandardMaterial[]
  ownedMaterials?: THREE.Material[]
}

export interface AirMount {
  location: MountLocation
  center: THREE.Vector3
  interior: THREE.Vector3
  available: boolean
}

export interface ChassisDetail extends ModelDetail {
  glass: THREE.Object3D
  powerIndicator: LightingMaterial
}

const defaultCase = { width: 225, height: 465, depth: 430 }
const defaultBoard = { width: 244, height: 305, depth: 15 }

export function chassisDimensions(part?: Part, motherboard?: Part): CaseDimensions {
  const metric = part?.dimensions ?? defaultCase
  const { width, height, depth } = normalizeSize(metric, defaultCase)
  const isCompact = part?.specs.formFactors?.every((factor) => factor === 'Mini-ITX')
  const verticalPsu = part?.id === 'nzxt-h7-flow-2024'
  const floor = verticalPsu ? .32 : Math.min(0.23, height * 0.065)
  const pan = verticalPsu ? .55 : isCompact ? floor + 0.15 : floor + Math.min(0.76, height * 0.19)
  const board = boardSize(motherboard)
  return {
    width, height, depth, floor, pan, verticalPsu,
    left: -width / 2,
    tray: width / 2 - (verticalPsu ? .36 : .24),
    top: height - 0.13,
    back: -depth / 2 + 0.085,
    front: depth / 2 - 0.095,
    boardY: height - board.height / 2 - (isCompact ? 0.24 : 0.49),
    boardZ: -depth / 2 + 0.24 + board.width / 2,
  }
}

function normalizeSize(
  dimensions: Part['dimensions'],
  fallback: { width: number; height: number; depth: number },
) {
  const value = (input: unknown, standard: number) => typeof input === 'number' && input > 0 ? input / 100 : standard / 100
  return {
    width: value(dimensions?.width, fallback.width),
    height: value(dimensions?.height, fallback.height),
    depth: value(dimensions?.depth, fallback.depth),
  }
}

function boardSize(part?: Part) {
  const format = part?.specs.formFactor
  const baseline = format === 'Mini-ITX'
    ? { width: 170, height: 170, depth: 12 }
    : format === 'Micro-ATX'
      ? { width: 244, height: 244, depth: 12 }
      : format === 'E-ATX'
        ? { width: 277, height: 305, depth: 15 }
        : defaultBoard
  return normalizeSize(part?.dimensions, baseline)
}

const corners = (size: number) => [-1, 1].flatMap((x) =>
  [-1, 1].map((y) => new THREE.Vector3(x * size, y * size, 0)),
)

const horizontal = (node: THREE.Object3D, positive = true) => node.rotateX(positive ? -Math.PI / 2 : Math.PI / 2)


export function chassis(part: Part, dim: CaseDimensions, mat: StudioMaterials, finish?: string): ChassisDetail {
  const { width: w, height: h, depth: d, floor, pan, left, top, back, front, tray } = dim
  const root = new THREE.Group()
  const glass = new THREE.Group()
  glass.name = 'glass'
  glass.position.set(left + 0.035, 0, back + 0.012)
  root.add(glass)

  const finishMaterial = mat.finish(finish ?? part.colors[0]).clone()
  const frame = Math.min(w * 0.07, 0.15)
  const bayHeight = top - pan
  const glassWidth = front - back - frame * 2
  const glassDepth = glassWidth / 2
  const isCompact = part.specs.formFactors?.every((factor) => factor === 'Mini-ITX')
  const glassFront = /h6|h9|o11|north xl.*tg|y60|y70/i.test(part.name)

  box(root, finishMaterial, [w, 0.12, d], [0, floor - 0.07, 0], 0.023)
  box(root, mat.dark, [w - 0.06, 0.12, d - 0.10], [0, floor + 0.035, 0], 0.024)
  for (const xSign of [-1, 1]) {
    for (const zSign of [-1, 1]) {
      const x = xSign * (w / 2 - 0.24)
      const z = zSign * (d / 2 - 0.25)
      const size: [number, number, number] = [0.31, floor - 0.1, 0.38]
      box(root, finishMaterial, size, [x, (floor - 0.1) / 2 + 0.045, z], 0.04)
      box(root, mat.dark, [0.29, 0.04, 0.35], [x, 0.02, z], 0.016)
    }
  }

  for (const y of [floor, top]) {
    for (const x of [left + frame / 2, -left - frame / 2]) {
      box(root, finishMaterial, [frame, 0.11, d], [x, y, 0], 0.025)
      box(root, mat.edge, [0.012, 0.023, d - 0.12], [x < 0 ? left - 0.005 : -left + 0.005, y + 0.053, 0])
    }
  }
  for (const x of [left + frame / 2, -left - frame / 2]) {
    for (const z of [back, front]) {
      box(root, finishMaterial, [frame, h - floor - 0.04, 0.13], [x, (h + floor) / 2 - 0.02, z], 0.018)
    }
  }

  box(root, finishMaterial, [w, 0.07, 0.22], [0, h - 0.036, front - 0.02], 0.023)
  box(root, finishMaterial, [w, 0.07, 0.18], [0, h - 0.036, back + 0.01], 0.023)
  for (const x of [left + 0.055, -left - 0.055]) {
    box(root, finishMaterial, [0.11, 0.075, d - 0.16], [x, h - 0.038, 0], 0.018)
  }
  vent(root, mat, w - 0.24, d - 0.43, [11, 26], [0, h - 0.067, -0.014], 'top')
  box(root, mat.dark, [w - 0.22, 0.028, 0.25], [0, h - 0.027, front - 0.12], 0.012)
  box(root, mat.plastic, [0.17, 0.024, 0.1], [left + 0.32, h - 0.005, front - 0.117], 0.012)
  box(root, mat.dark, [0.12, 0.02, 0.065], [left + 0.32, h + 0.002, front - 0.117], 0.006)
  box(root, mat.plastic, [0.079, 0.021, 0.052], [left + 0.49, h - 0.005, front - 0.117], 0.012)
  box(root, mat.dark, [0.047, 0.022, 0.03], [left + 0.49, h - 0.002, front - 0.117], 0.008)
  cylinders(root, mat.edge, 0.074, 0.014, [new THREE.Vector3(-left - 0.25, h, front - 0.117)])
  const powerIndicator = mat.light()
  cylinders(root, powerIndicator, 0.028, 0.015, [new THREE.Vector3(-left - 0.25, h + 0.004, front - 0.117)])

  box(root, finishMaterial, [0.05, top - floor, d - 0.15], [-left - 0.036, (top + floor) / 2, 0.03], 0.022)
  box(root, mat.dark, [0.025, h - 0.93, d - 0.23], [tray, (top + floor) / 2 + 0.1, 0.0], 0.012)
  if (!isCompact && !dim.verticalPsu) {
    box(root, finishMaterial, [0.049, pan - floor - 0.03, d - 0.13], [left + 0.06, pan / 2 + floor / 2, 0.015], 0.018)
    box(root, mat.edge, [0.015, 0.021, d - 0.16], [left + 0.035, pan + 0.007, 0.015], 0.006)
    for (const z of [back + 0.11, front - 0.1]) {
      box(root, finishMaterial, [w - 0.18, 0.04, 0.19], [0, pan, z])
    }
    vent(root, mat, w - 0.15, d - 0.31, [13, 28], [0, pan, 0], 'top')
    stripLabels(root, mat, part.brand.toUpperCase(), 0.76, 0.15, [left + 0.029, pan - 0.33, front - 0.65], 'side', '#8e929f')
  }

  const rearSlotX = tray - 0.13
  box(root, finishMaterial, [0.57, top - floor, 0.09], [left + 0.29, (top + floor) / 2, back], 0.016)
  box(root, finishMaterial, [0.18, top - floor, 0.1], [-left - 0.09, (top + floor) / 2, back], 0.009)
  vent(root, mat, w - 0.47, 1.27, [11, 7], [-0.13, top - 0.85, back - 0.04])
  for (let index = 0; index < 7; index++) {
    const y = pan + 0.18 + index * 0.19
    box(root, mat.edge, [1.12, 0.11, 0.065], [rearSlotX - 0.54, y, back + 0.01], 0.009)
    vent(root, mat, 1.05, 0.075, [10, 1], [rearSlotX - 0.54, y, back - 0.024])
  }

  if (glassFront) {
    box(root, mat.glass, [w - 0.23, h - 0.45, 0.024], [0, (top + floor) / 2, front + 0.026], 0.01).renderOrder = 9
  } else {
    box(root, finishMaterial, [w - 0.015, 0.14, 0.12], [0, floor + 0.122, front + 0.01], 0.016)
    box(root, finishMaterial, [w - 0.015, 0.145, 0.12], [0, top - 0.029, front + 0.01], 0.016)
    vent(root, mat, w - 0.18, h - 0.55, [10, 21], [0, (top + floor) / 2 + 0.04, front + 0.075])
  }

  const glassHeight = Math.max(0.7, bayHeight - 0.085)
  const glassY = (top + pan) / 2
  box(glass, mat.glass, [0.026, glassHeight, glassWidth], [-0.016, glassY, glassDepth + frame], 0.025).renderOrder = 8
  for (const z of [frame, front - back - frame]) {
    box(glass, mat.edge, [0.033, glassHeight, 0.019], [-0.018, glassY, z], 0.006)
  }
  for (const y of [glassY - glassHeight / 2, glassY + glassHeight / 2]) {
    box(glass, mat.edge, [0.038, 0.019, glassWidth], [-0.017, y, glassDepth + frame], 0.006)
  }
  return { root, glass, powerIndicator, rotors: [], lights: [], dimensions: [w, h, d], finishMaterials: [finishMaterial], ownedMaterials: [finishMaterial] }
}

function fanRotor(radius: number, mat: StudioMaterials) {
  const rotor = new THREE.Group()
  rotor.name = 'rotor'
  const bladeShape = new THREE.Shape()
  bladeShape.moveTo(radius * 0.19, radius * 0.09)
  bladeShape.bezierCurveTo(radius * 0.39, -radius * 0.03, radius * 0.64, radius * 0.065, radius * 0.84, radius * 0.27)
  bladeShape.bezierCurveTo(radius * 0.92, radius * 0.43, radius * 0.86, radius * 0.55, radius * 0.77, radius * 0.61)
  bladeShape.bezierCurveTo(radius * 0.58, radius * 0.36, radius * 0.42, radius * 0.35, radius * 0.21, radius * 0.22)
  bladeShape.closePath()
  const geometry = new THREE.ExtrudeGeometry(bladeShape, {
    depth: radius * 0.037,
    steps: 1,
    curveSegments: 5,
    bevelEnabled: false,
  })
  const blades = new THREE.InstancedMesh(geometry, mat.blade, 9)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < 9; i++) {
    matrix.makeRotationZ(i * Math.PI * 2 / 9)
    blades.setMatrixAt(i, matrix)
  }
  rotor.add(blades)
  cylinders(rotor, mat.plastic, radius * 0.255, radius * 0.17, [new THREE.Vector3()], 'z')
  cylinders(rotor, mat.edge, radius * 0.203, radius * 0.012, [new THREE.Vector3(0, 0, radius * 0.091)], 'z')
  return rotor
}

function fanModule(size: number, mat: StudioMaterials, rgb: boolean, label = ''): ModelDetail {
  const root = new THREE.Group()
  const ringRadius = size * 0.421
  const lightMaterial = rgb ? mat.light() : mat.edge
  const rotor = fanRotor(ringRadius, mat)
  const torus = (radius: number, girth: number, material: THREE.Material, z: number) => {
    mesh(root, new THREE.TorusGeometry(radius, girth, 8, 44), material, [0, 0, z])
  }
  torus(ringRadius + size * 0.028, size * 0.045, mat.plastic, 0)
  torus(ringRadius, size * 0.024, lightMaterial, size * 0.052)
  torus(ringRadius, size * 0.011, rgb ? lightMaterial : mat.dark, -size * 0.08)
  torus(ringRadius - size * 0.025, size * 0.016, mat.plastic, -size * 0.078)
  for (const point of corners(size * 0.411)) {
    box(root, mat.dark, [size * 0.164, size * 0.164, size * 0.195], [point.x, point.y, 0], size * 0.019)
    box(root, mat.plastic, [size * 0.012, size * 0.16, size * 0.132], [Math.sign(point.x) * size * 0.493, point.y, 0], size * 0.004)
    box(root, mat.blade, [size * 0.17, size * 0.012, size * 0.132], [point.x, Math.sign(point.y) * size * 0.491, 0], size * 0.004)
  }
  cylinders(root, mat.zinc, size * 0.022, size * 0.013, corners(size * 0.41).map((v) => v.setZ(size * 0.105)), 'z')
  cylinders(root, mat.dark, size * 0.015, size * 0.014, corners(size * 0.41).map((v) => v.setZ(size * 0.112)), 'z')
  root.add(rotor)
  if (label) stripLabels(root, mat, label, size * 0.155, size * 0.055, [0, 0, size * 0.115], 'front', '#999ca9')
  return { root, rotors: [{ node: rotor, axis: 'z' }], lights: rgb ? [{ material: lightMaterial }] : [] }
}

function degreeOfMounts(part?: Part) {
  return part?.specs.fanMounts
}

export function mountPoints(
  chassisPart: Part | undefined,
  dim: CaseDimensions,
  size: number,
  radiator?: { location: MountLocation; size: number },
) {
  const { width, height, floor, front, back, top, tray } = dim
  const official = degreeOfMounts(chassisPart)
  const rows: Record<MountLocation, FanMount> = {
    front: { location: 'front', fanSizes: [120, 140], quantity: 2 },
    top: { location: 'top', fanSizes: [120, 140], quantity: 2 },
    rear: { location: 'rear', fanSizes: [120], quantity: 1 },
    bottom: { location: 'bottom', fanSizes: [120], quantity: 1 },
    side: { location: 'side', fanSizes: [], quantity: 0 },
  }
  const mounts: AirMount[] = []
  for (const location of Object.keys(rows) as MountLocation[]) {
    const slot = official ? official.find((candidate) => candidate.location === location) : rows[location]
    const mm = Math.round(size * 100)
    const eligible = slot?.fanSizes.includes(mm)
    const sizeLimits = (slot as (FanMount & { fanSizeLimits?: Record<number, number> }) | undefined)?.fanSizeLimits
    const qty = Math.min(sizeLimits?.[mm] ?? slot?.quantity ?? 0, 4)
    let occupied = 0
    if (radiator?.location === location) {
      const radiatorFan = radiator.size % 140 === 0 ? 140 : 120
      occupied = radiatorFan === mm ? Math.ceil(radiator.size / radiatorFan) : qty
    }
    if (!eligible || qty <= occupied) continue
    const dx = Math.min(0.14, width * .06)
    const add = (center: THREE.Vector3, interior: THREE.Vector3) => {
      mounts.push({ location, center, interior, available: true })
    }
    for (let index = occupied; index < qty; index++) {
      if (location === 'front') add(
        new THREE.Vector3(0, height - size * (index + 0.5) - 0.39, front - 0.14),
        new THREE.Vector3(0, 0, -1),
      )
      if (location === 'rear') add(new THREE.Vector3(-dx, top - size / 2 - 0.27, back + 0.21), new THREE.Vector3(0, 0, 1))
      if (location === 'top') add(
        new THREE.Vector3(-dx, top - 0.14, back + size * (index + 0.5) + 0.15),
        new THREE.Vector3(0, -1, 0),
      )
      if (location === 'bottom') {
        const center = dim.verticalPsu
          ? new THREE.Vector3(-.27, .44, .03 + (1 - index) * 1.30)
          : new THREE.Vector3(-dx, floor + .12, front - size * (index + .5) - .21)
        add(center, new THREE.Vector3(0, 1, 0))
      }
      if (location === 'side') add(
        new THREE.Vector3(tray - 0.15, top - size * (index + 0.5) - 0.24, front - size / 2 - 0.25),
        new THREE.Vector3(-1, 0, 0),
      )
    }
  }
  return mounts
}

export function mountableLocations(
  chassisPart: Part | undefined,
  fanPart: Part | undefined,
  coolingPart?: Part,
  ram?: Part,
  gpu?: Part,
) {
  if (!chassisPart || !fanPart) return []
  const size = (fanPart.specs.fanSizeMm ?? 120) / 100
  const dimension = chassisDimensions(chassisPart)
  const radiators: MountLocation[] = ['front', 'top', 'rear', 'bottom', 'side']
  return radiators.filter((fanLocation) => {
    const location = resolveRadiatorLocation(chassisPart, coolingPart, ram, gpu, {fan: fanPart, fanLocation})
    const nominal = coolingPart?.specs.radiatorMm
    if (nominal && !location) return false
    const radiator = location && nominal ? { location, size: nominal } : undefined
    const points = mountPoints(chassisPart, dimension, size, radiator).filter((mount) => mount.location === fanLocation)
    return points.length >= (fanPart.specs.fanCount ?? 1)
  })
}

export function caseFans(
  part: Part,
  casePart: Part | undefined,
  dim: CaseDimensions,
  mat: StudioMaterials,
  options: SceneOptions,
  radiator?: { location: MountLocation; size: number },
): ModelDetail {
  const root = new THREE.Group()
  const size = (part.specs.fanSizeMm ?? 120) / 100
  const all = mountPoints(casePart, dim, size, radiator)
  const primary = options.fanLocation
  const sortValue = (location: MountLocation) => location === primary ? 0 : location === 'rear' ? 1 : 2
  const requested = Math.min(6, Math.max(1, part.specs.fanCount ?? 1))
  const selected = all.sort((a, b) => sortValue(a.location) - sortValue(b.location)).slice(0, requested)
  const rotors: Rotor[] = []
  const lights: ModelLights[] = []
  const direction = new THREE.Vector3(0, 0, 1)
  const fanUnits = []
  for (const mount of selected) {
    const fan = fanModule(size, mat, Boolean(part.specs.rgb), '')
    fan.root.position.copy(mount.center)
    const exterior = mount.interior.clone().negate()
    const inward = mount.location === primary ? options.airflowDirection === 'intake' : ['front', 'bottom', 'side'].includes(mount.location)
    fan.root.quaternion.setFromUnitVectors(direction, inward ? exterior : mount.interior)
    root.add(fan.root)
    fanUnits.push({ root: fan.root, location: mount.location })
    for (const rotor of fan.rotors) rotors.push({ ...rotor, location: mount.location })
    for (const light of fan.lights) lights.push({ ...light, location: mount.location })
  }
  return { root, rotors, lights, mounts: selected, fanUnits, dimensions: [size, size, (part.dimensions?.depth ?? 25) / 100] }
}

export function motherboard(part: Part, dim: CaseDimensions, mat: StudioMaterials): ModelDetail {
  const root = new THREE.Group()
  const { width: w, height: h, depth: pcbDepth } = boardSize(part)
  root.position.set(dim.tray - 0.017, dim.boardY, dim.boardZ)
  const board = box(root, mat.pcb, [0.035, h, w], [0, 0, 0], 0.008)
  board.receiveShadow = true
  const detail = Math.min(1, Math.min(h, w) * 0.43)
  const heatsink = Math.min(0.66, w * 0.27)
  box(root, mat.dark, [Math.max(0.14, pcbDepth), h * .4, heatsink], [-0.11, h * 0.29, -w * 0.36], 0.019)
  box(root, mat.edge, [0.027, h * .37, heatsink - 0.035], [-0.197, h * 0.29, -w * 0.36], 0.012)
  box(root, mat.graphite, [0.035, h * .33, heatsink - 0.063], [-0.216, h * 0.29, -w * 0.36], 0.009)
  box(root, mat.edge, [0.13, 0.195, w * 0.38], [-0.08, h * 0.4, -w * 0.106], 0.012)
  stripLabels(root, mat, part.brand.toUpperCase(), 0.45, 0.14 * detail, [-0.236, h * 0.417, -w * 0.375], 'side', '#acafbc')
  stripLabels(root, mat, String(part.specs.chipset ?? part.model.split(' ')[0]), 0.40, 0.116 * detail, [-0.24, h * 0.29, -w * 0.38], 'side', '#747985', 'tech')

  const chipX = -0.035
  const chipY = h * 0.21
  const chipZ = -w * 0.082
  box(root, mat.chip, [0.052, 0.51, .51], [chipX, chipY, chipZ], 0.017)
  box(root, mat.zinc, [0.04, 0.45, 0.45], [chipX - 0.035, chipY, chipZ], 0.015)
  box(root, mat.contacts, [0.008, 0.34, 0.34], [chipX - .056, chipY, chipZ], 0.008)

  const ramRows = Math.max(2, Math.min(4, part.specs.memorySlots ?? 4))
  for (let i = 0; i < ramRows; i++) {
    const z = w * .15 + i * .105
    box(root, i % 2 === 0 ? mat.dark : mat.plastic, [0.068, h * 0.49, 0.064], [-0.052, h * 0.2, z], 0.012)
    box(root, mat.contacts, [0.012, h * 0.45, 0.017], [-0.093, h * 0.2, z], 0.002)
  }
  box(root, mat.dark, [0.14, h * .18, 0.105], [-0.085, h * .13, w * .46], 0.01)
  box(root, mat.edge, [0.102, .125, 1.67 * detail], [-0.057, h * -.18, w * -.11], 0.01)
  box(root, mat.dark, [0.093, .084, 1.6 * detail], [-0.093, h * -.18, w * -.11], 0.01)
  box(root, mat.dark, [0.075, .081, 1.49 * detail], [-0.055, h * -.405, w * -.12], 0.01)
  box(root, mat.graphite, [0.115, h * .18, w * .29], [-0.087, h * -.31, w * .31], 0.023)
  box(root, mat.dark, [0.125, .125, w * .71], [-0.073, h * -.07, w * -.08], 0.015)
  stripLabels(root, mat, 'M.2', 0.42, 0.09, [-0.139, h * -.07, w * -.31], 'side', '#969aa8', 'tech')

  const holes = [-1, 0, 1].flatMap((a) => [-1, 1].map((b) => new THREE.Vector3(-.04, a * (h / 2 - .11), b * (w / 2 - .085))))
  cylinders(root, mat.edge, .029, .019, holes, 'x')
  cylinders(root, mat.dark, .012, .022, holes, 'x')

  const rows = 24
  const trace: number[] = []
  const circuitMaterial = new THREE.LineBasicMaterial({ color: 0x424747, transparent: true, opacity: .7 })
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(.026, .032, .028), mat.chip, rows * 3)
  const matrix = new THREE.Matrix4()
  let cursor = 0
  for (let i = 0; i < rows; i++) {
    const y = -h * .45 + i * h * .86 / (rows - 1)
    const start = Math.sin(i * 19) * w * .26 - w * .32
    const jog = i % 2 === 0 ? .10 : -.10
    const end = w * .43 - (i % 5) * .06
    trace.push(-.023, y, start, -.023, y, end - .15, -.023, y, end - .15, -.023, y + jog, end - .03)
    for (let c = 0; c < 3; c++) {
      matrix.makeTranslation(-.03, y + .035 * c, c * .13 + start)
      blocks.setMatrixAt(cursor++, matrix)
    }
  }
  const traceGeom = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(trace, 3))
  root.add(new THREE.LineSegments(traceGeom, circuitMaterial), blocks)

  const capPoints = Array.from({ length: 15 }, (_, i) => new THREE.Vector3(-.047, h * .36 + i % 3 * .047, -w * .197 + Math.floor(i / 3) * .104))
  cylinders(root, mat.edge, .028, .067, capPoints, 'x')

  const lights: ModelLights[] = []
  if (part.specs.rgb) {
    const badge = mat.light()
    box(root, badge, [.015, .035, w * .18], [-.235, h * .23, -w * .375], .005)
    lights.push({ material: badge })
  }
  return { root, rotors: [], lights, dimensions: [.31, h, w], ownedMaterials: [circuitMaterial] }
}

function socketAnchor(dim: CaseDimensions, board?: Part): [number, number, number] {
  const { height, width } = boardSize(board)
  return [dim.tray - .164, dim.boardY + height * .21, dim.boardZ - width * .082]
}

export function processor(part: Part, dim: CaseDimensions, mat: StudioMaterials, board?: Part): ModelDetail {
  const root = new THREE.Group()
  root.position.set(...socketAnchor(dim, board))
  const lga1700 = part.specs.socket === 'LGA1700'
  const width = Math.min(.51, Math.max(.30, (part.dimensions?.width ?? (lga1700 ? 45 : 40)) / 100))
  const height = Math.min(.51, Math.max(.30, (part.dimensions?.height ?? (lga1700 ? 37.5 : 40)) / 100))
  const thickness = Math.max(.03, (part.dimensions?.depth ?? (lga1700 ? 5.55 : part.specs.socket === 'AM5' ? 4.55 : 4)) / 100)
  box(root, mat.pcb, [thickness * .44, height, width], [thickness * .22, 0, 0], .008)
  box(root, mat.zinc, [thickness * .56, height * .8, width * .8], [-thickness * .28, 0, 0], .015)
  stripLabels(root, mat, part.brand.toUpperCase(), width * .56, height * .19, [-thickness * .57, 0, 0], 'side', '#5a5e67')
  return { root, rotors: [], lights: [], dimensions: [thickness, height, width] }
}

export function memory(part: Part, dim: CaseDimensions, mat: StudioMaterials, board?: Part): ModelDetail {
  const root = new THREE.Group()
  const boardDims = boardSize(board)
  root.position.set(dim.tray - .145, dim.boardY + boardDims.height * .2, dim.boardZ + boardDims.width * .15)
  const moduleHeight = Math.max(.99, (part.dimensions?.width ?? 133.35) / 100)
  const moduleHeightMm = typeof part.specs.moduleHeightMm === 'number' ? part.specs.moduleHeightMm : 44
  const stickDepth = Math.min(.56, Math.max(.31, (part.dimensions?.height ?? moduleHeightMm) / 100))
  const count = Math.max(1, Math.min(4, part.specs.memoryModules ?? 2))
  const rgb = part.specs.rgb ? mat.light() : undefined
  const finish = mat.finish(part.colors[0])
  for (let index = 0; index < count; index++) {
    const z = count === 2 ? .106 + index * .212 : index * .107
    box(root, mat.pcb, [stickDepth, moduleHeight, .061], [-stickDepth * .42, 0, z], .006)
    box(root, finish, [stickDepth * .86, moduleHeight - .075, .086], [-stickDepth * .49, 0, z], .018)
    box(root, mat.edge, [.044, moduleHeight - .035, .091], [-stickDepth * .78, 0, z], .015)
    box(root, mat.zinc, [.052, .22, .093], [-stickDepth * .24, moduleHeight * .29, z], .006)
    if (rgb) box(root, rgb, [.024, moduleHeight - .10, .049], [-stickDepth * .93, 0, z], .009)
  }
  return { root, rotors: [], lights: rgb ? [{ material: rgb }] : [], dimensions: [stickDepth, moduleHeight, count === 2 ? .288 : .086 + .107 * (count - 1)] }
}

function gpuShroud(depth: number, width: number, material: THREE.Material) {
  const x = width / 2
  const z = depth / 2
  const shape = new THREE.Shape()
  shape.moveTo(-x + .13, -z)
  shape.lineTo(x - .18, -z)
  shape.lineTo(x, -z + .18)
  shape.lineTo(x, z - .17)
  shape.lineTo(x - .14, z)
  shape.lineTo(-x + .26, z)
  shape.lineTo(-x, z - .25)
  shape.lineTo(-x, -z + .16)
  shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: .074, bevelEnabled: true, bevelSize: .027, bevelThickness: .015, bevelSegments: 2 })
  geometry.rotateX(-Math.PI / 2)
  return new THREE.Mesh(geometry, material)
}

export function graphics(part: Part, dim: CaseDimensions, mat: StudioMaterials, board?: Part): ModelDetail {
  const root = new THREE.Group()
  const length = (part.dimensions?.width ?? 278) / 100
  const height = (part.dimensions?.height ?? 134) / 100
  const thick = (part.dimensions?.depth ?? 48) / 100
  const boardDims = boardSize(board)
  root.position.set(
    dim.tray - height / 2 - .085,
    dim.boardY - boardDims.height * .18 - thick * .52,
    dim.back + length / 2 + .035,
  )
  const rgb = part.specs.rgb ? mat.light() : undefined
  const finish = mat.finish(part.colors[0])
  const shroud = gpuShroud(length, height, finish)
  shroud.position.y = -thick / 2 + .015
  root.add(shroud)

  const fans = Math.max(1, Math.min(3, part.specs.fanCount ?? (length > 3.1 ? 3 : 2)))
  const rotors: Rotor[] = []
  for (let index = 0; index < fans; index++) {
    const z = length * ((index + .5) / fans - .5)
    const radius = Math.min(height * .385, length * .392 / fans)
    const fan = fanRotor(radius, mat)
    horizontal(fan, false)
    fan.position.set(-.022, -thick / 2 - .046, z)
    root.add(fan)
    const lip = mesh(root, new THREE.TorusGeometry(radius + .008, .021, 6, 44), mat.plastic, [-.022, -thick / 2 - .042, z])
    horizontal(lip)
    rotors.push({ node: fan, axis: 'z' })
  }

  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(height * .84, thick * .51, .010), mat.edge, Math.floor(length * 29))
  const matrix = new THREE.Matrix4()
  for (let index = 0; index < fins.count; index++) {
    matrix.makeTranslation(.0, .013, -length * .472 + (index + .5) * length * .944 / fins.count)
    fins.setMatrixAt(index, matrix)
  }
  root.add(fins)
  box(root, mat.pcb, [height - .028, .034, length - .09], [0, thick * .23, -.025], .015)
  box(root, mat.graphite, [height - .041, .058, length - .065], [0, thick * .5 - .03, .0], .043)
  box(root, finish, [.16, thick * .58, length - .1], [-height * .46, .0, .025], .026)
  box(root, mat.edge, [.03, .045, length - .18], [-height * .514, thick * .34, .019], .013)
  box(root, mat.dark, [.043, .17, length * .56], [-height * .525, -.025, length * .085], .018)
  box(root, mat.copper, [.10, .039, length * .68], [height * .47, -.065, -.028], .013)
  box(root, mat.zinc, [height + .092, thick + .057, .027], [.012, 0, -length * .505], .01)
  for (let index = 0; index < 4; index++) {
    box(root, mat.dark, [.142, .061, .018], [height * -.36 + index * .181, thick * -.095, -length * .52], .007)
  }
  const shortName = /RTX/.test(part.model) ? 'GEFORCE RTX' : /RX/.test(part.model) ? 'RADEON' : part.brand.toUpperCase()
  stripLabels(root, mat, shortName, Math.min(length * .51, 1.30), Math.min(thick * .35, .129), [-height * .553, -.007, length * .082], 'side', '#c2c4cf')
  stripLabels(root, mat, part.brand.toUpperCase(), Math.min(1.08, length * .42), height * .19, [0, thick * .514, -length * .20], 'top', '#9498a4')
  if (rgb) box(root, rgb, [.012, .021, length * .38], [-height * .54, -thick * .28, length * .16], .007)
  return { root, rotors, lights: rgb ? [{ material: rgb }] : [], dimensions: [height, thick, length] }
}

export function cooling(
  part: Part,
  dim: CaseDimensions,
  mat: StudioMaterials,
  board?: Part,
  radiatorMount?: MountLocation,
): ModelDetail {
  const root = new THREE.Group()
  root.position.set(...socketAnchor(dim, board))
  const rgb = Boolean(part.specs.rgb)
  const lights: ModelLights[] = []
  const rotors: Rotor[] = []
  const radiatorMm = part.specs.radiatorMm
  const { width: w, top, front, back } = dim

  if (!radiatorMm) {
    const h = (part.specs.coolerHeightMm ?? 155) / 100
    const finWidth = (part.dimensions?.width ?? 132) / 100
    const physicalDepth = typeof part.specs.sceneDepthMm === 'number'
      ? part.specs.sceneDepthMm
      : part.id === 'thermalright-peerless-assassin-120-se' ? 135 : part.dimensions?.depth ?? 118
    const finDepth = physicalDepth / 100
    const fanSize = Math.min(finWidth, (part.specs.fanSizeMm ?? 120) / 100)
    const fan = fanModule(fanSize, mat, rgb)
    fan.root.rotateY(-Math.PI / 2)
    fan.root.position.set(-h + .13, 0, 0)
    root.add(fan.root)
    rotors.push(...fan.rotors)
    lights.push(...fan.lights)
    const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(.009, finWidth, finDepth), mat.edge, 37)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < fins.count; i++) {
      matrix.makeTranslation(-.22 - h * .72 * i / (fins.count - 1), 0, 0)
      fins.setMatrixAt(i, matrix)
    }
    root.add(fins)
    for (let i = -2; i <= 2; i++) {
      const z = i * finDepth * .16
      tubing(root, mat.copper, [[0, -.23, z], [-.18, -.31, z], [-.49, -finWidth * .30, z], [-h * .82, -finWidth * .39, z]], .037, 14)
      tubing(root, mat.copper, [[0, .23, z], [-.18, .31, z], [-.49, finWidth * .30, z], [-h * .82, finWidth * .39, z]], .037, 14)
    }
    box(root, mat.zinc, [.07, .45, .45], [-.033, 0, 0], .016)
    return { root, rotors, lights, dimensions: [h, finWidth, finDepth] }
  }

  const pumpGroup = new THREE.Group()
  root.add(pumpGroup)
  const pumpWidth = typeof part.specs.pumpWidthMm === 'number' ? part.specs.pumpWidthMm / 100 : .78
  const pumpDepth = typeof part.specs.pumpDepthMm === 'number' ? part.specs.pumpDepthMm / 100 : .78
  const pumpHeight = typeof part.specs.pumpHeightMm === 'number' ? part.specs.pumpHeightMm / 100 : .38
  const pumpRadius = Math.min(.43, Math.max(.31, pumpWidth / 2))
  const assetMounts: AssetMount[] = [
    { name: 'pump', target: pumpGroup, size: [pumpHeight, pumpWidth, pumpDepth], center: [-pumpHeight / 2, 0, 0] },
  ]
  const ring = rgb ? mat.light() : mat.edge
  const pump = cylinders(pumpGroup, mat.plastic, pumpRadius, .30, [new THREE.Vector3(-.19, 0, 0)], 'x')
  pump.name = 'coolant-pump'
  cylinders(pumpGroup, mat.dark, pumpRadius * .87, .022, [new THREE.Vector3(-.341, 0, 0)], 'x')
  cylinders(pumpGroup, mat.glass, pumpRadius * .66, .023, [new THREE.Vector3(-.355, 0, 0)], 'x')
  const bezel = mesh(pumpGroup, new THREE.TorusGeometry(pumpRadius * .835, .015, 7, 48), ring, [-.362, 0, 0])
  bezel.rotateY(Math.PI / 2)
  stripLabels(pumpGroup, mat, part.brand.toUpperCase(), pumpRadius * 1.23, .151, [-.378, 0, 0], 'side', '#dde0e9')
  if (rgb) lights.push({ material: ring })

  const rad = new THREE.Group()
  const radSize = radiatorMm / 100
  const radDepth = (part.dimensions?.depth ?? radiatorMm + 25) / 100
  const thick = (part.specs.radiatorThicknessMm ?? 27) / 100
  const fanQty = Math.max(1, Math.min(3, Math.round(radiatorMm / 120)))
  const fanWidth = (part.specs.fanSizeMm ?? (radiatorMm % 140 === 0 ? 140 : 120)) / 100
  const radWidth = (part.dimensions?.width ?? fanWidth * 100) / 100
  const fanThickness = typeof part.specs.fanThicknessMm === 'number' ? part.specs.fanThicknessMm / 100 : .25
  const place = radiatorMount
  if (!place) return { root, rotors, lights, assetMounts }
  const topWorld = new THREE.Vector3(Math.min(0, -w * .055), top - thick / 2 - .1, back + radDepth / 2 + .24)
  const world = place === 'top' ? topWorld
    : new THREE.Vector3(0, top - radDepth / 2 - .35, place === 'rear' ? back + thick / 2 : front - thick / 2 - .10)
  if (place === 'side') world.set(dim.tray - .16, top - radDepth / 2 - .36, front - radWidth / 2 - .20)
  if (place === 'bottom') world.set(-w * .055, dim.floor + thick / 2 + .11, front - radDepth / 2 - .10)
  if (place === 'front' || place === 'rear') rad.rotateX(Math.PI / 2)
  if (place === 'bottom') rad.rotateZ(Math.PI)
  if (place === 'side') rad.rotation.set(Math.PI / 2, 0, -Math.PI / 2, 'ZYX')
  rad.position.copy(world).sub(root.position)
  root.add(rad)
  assetMounts.push({
    name: 'radiator', target: rad, size: [Math.max(radWidth, fanWidth), thick + fanThickness, radDepth],
    center: [0, -fanThickness / 2, 0],
  })
  box(rad, mat.dark, [radWidth + .075, thick, radDepth], [0, 0, 0], .032)
  box(rad, mat.edge, [.04, thick, radDepth - .08], [-radWidth * .5, 0, 0], .012)
  box(rad, mat.edge, [.04, thick, radDepth - .08], [radWidth * .5, 0, 0], .012)
  const fins = new THREE.InstancedMesh(new THREE.BoxGeometry(radWidth - .11, .008, .012), mat.graphite, Math.floor(radDepth * 35))
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < fins.count; i++) {
    matrix.makeTranslation(0, -thick * .503, -radDepth * .44 + radDepth * .88 * i / fins.count)
    fins.setMatrixAt(i, matrix)
  }
  rad.add(fins)
  for (let i = 0; i < fanQty; i++) {
    const fan = fanModule(fanWidth * .97, mat, rgb)
    horizontal(fan.root, false)
    fan.root.position.set(0, -thick / 2 - fanThickness / 2, -radSize / 2 + radSize * (i + .5) / fanQty)
    rad.add(fan.root)
    rotors.push(...fan.rotors)
    lights.push(...fan.lights)
  }

  const tubeGroup = new THREE.Group()
  tubeGroup.name = 'coolant-hoses'
  root.add(tubeGroup)
  const defaultPump = [new THREE.Vector3(-.185, -.15, .18), new THREE.Vector3(-.185, -.245, .32)]
  const defaultRadiator = Array.from({ length: 2 }, (_, i) => (
    new THREE.Vector3(-radWidth * .35 + i * .16, -thick * .13, radDepth * .47).applyQuaternion(rad.quaternion).add(rad.position)
  ))

  function updateTubes(pumpPorts: THREE.Vector3[], radiatorPorts: THREE.Vector3[]) {
    for (const object of [...tubeGroup.children]) {
      if (object instanceof THREE.Mesh) object.geometry.dispose()
      tubeGroup.remove(object)
    }
    for (let i = 0; i < 2; i++) {
      const start = pumpPorts[i] ?? defaultPump[i]
      const end = radiatorPorts[i] ?? defaultRadiator[i]
      const toTop = place === 'top'
      const sweep = end.z - (place === 'rear' ? -.41 : .27)
      const points: [number, number, number][] = [
        [start.x, start.y, start.z],
        [start.x - .15, start.y - .10, start.z + .22],
        [Math.min(start.x - .38 - i * .10, end.x - .10), toTop ? .11 : start.y + .6, sweep - .31],
        [end.x - .12, end.y - (toTop ? .34 : .14), sweep],
        [end.x, end.y, end.z],
      ]
      tubing(tubeGroup, mat.tube, points, .064, 32)
      tubing(tubeGroup, mat.plastic, points.slice(0, 2), .079, 7)
    }
  }

  updateTubes(defaultPump, defaultRadiator)
  return { root, rotors, lights, assetMounts, updateTubes }
}

export function powerSupply(part: Part, dim: CaseDimensions, mat: StudioMaterials): ModelDetail {
  const root = new THREE.Group()
  const depth = (part.specs.psuLengthMm ?? part.dimensions?.depth ?? 140) / 100
  const width = (part.dimensions?.width ?? 150) / 100
  const height = (part.dimensions?.height ?? 86) / 100
  if (dim.verticalPsu) {
    root.position.set(.70, 1.03, dim.back + depth / 2 + .035)
    root.rotateZ(Math.PI / 2)
  } else root.position.set(0, dim.floor + height / 2, dim.back + depth / 2 + .025)
  box(root, mat.painted, [width, height, depth], [0, 0, 0], .039)
  vent(root, mat, width * .9, depth * .84, [8, 7], [0, height / 2 + .003, -.04], 'top')
  const ventRear = vent(root, mat, width * .87, height * .74, [8, 4], [0, 0, -depth / 2 - .002])
  ventRear.rotateY(Math.PI)
  box(root, mat.dark, [.35, .185, .05], [-width * .24, height * .22, -depth / 2 - .013], .012)
  const number = part.specs.psuWatts
  stripLabels(root, mat, number ? `${number} W` : part.model.split(' ')[0], depth * .62, height * .32, [-width * .504, .0, 0], 'side', '#8d909c')
  return { root, rotors: [], lights: [], dimensions: [width, height, depth] }
}

export function storageDrive(part: Part, dim: CaseDimensions, mat: StudioMaterials, board?: Part): ModelDetail {
  const root = new THREE.Group()
  const isM2 = part.specs.storageInterface?.startsWith('M.2')
  const length = (isM2 ? part.specs.storageLengthMm ?? 80 : part.dimensions?.depth ?? 100) / 100
  const width = (isM2 ? 22 : part.dimensions?.width ?? 70) / 100
  const boardDims = boardSize(board)
  const thickness = (part.dimensions?.height ?? (isM2 ? 2.38 : 7)) / 100
  root.position.set(dim.tray - .141, dim.boardY - boardDims.height * .075, dim.boardZ - boardDims.width * .09)
  if (!isM2) root.position.set(dim.tray + .1, dim.floor + .46, dim.front - .8)
  box(root, isM2 ? mat.pcb : mat.painted, [thickness, width, length], [0, 0, 0], .01)
  box(root, mat.chip, [.028, width * .74, length * .81], [-.03, 0, -.013], .012)
  box(root, mat.contacts, [.01, width * .66, .07], [-.023, 0, length * .446], .006)
  stripLabels(root, mat, part.brand.toUpperCase(), length * .66, width * .48, [-.05, 0, 0], 'side', '#b1b3c2', 'tech')
  return { root, rotors: [], lights: [], dimensions: [thickness, width, length] }
}

export function powerCables(
  dim: CaseDimensions,
  mat: StudioMaterials,
  gpu?: THREE.Group,
  psu?: THREE.Group,
  board?: Part,
): THREE.Group {
  const root = new THREE.Group()
  const boardDims = boardSize(board)
  if (!psu) return root
  const edge = dim.boardZ + boardDims.width * .48
  const runY = dim.boardY + boardDims.height * .13
  for (let i = 0; i < 7; i++) {
    const off = i * .033
    tubing(root, mat.cable, [
      [dim.tray - .15, runY - .136 + off, edge],
      [dim.tray - .3, runY - .13 + off, edge + .19],
      [dim.tray - .11, runY - .26 + off, edge + .38],
      [dim.tray + .12, runY - .15 + off, edge + .51],
    ], .015)
  }
  if (!gpu) return root
  const x = gpu.position.x - .14
  const y = gpu.position.y + .18
  const z = gpu.position.z + .44
  for (let i = 0; i < 7; i++) {
    const off = i * .036
    tubing(root, mat.cable, [
      [x, y, z + off],
      [x - .16, y + .15, z + .1 + off],
      [x - .28, y + .055, z + .19 + off],
      [x - .32, y - .17, z + .29 + off],
      [dim.verticalPsu ? dim.tray - .4 : x - .26, dim.pan + .22, z + .38 + off],
      [dim.verticalPsu ? dim.tray + .12 : x - .15, dim.pan - .035, z + .47 + off],
    ], .016, 22)
  }
  box(root, mat.dark, [.09, .041, .27], [x - .289, y - .053, z + .313], .009)
  return root
}
