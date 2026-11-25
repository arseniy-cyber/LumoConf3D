import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import type { Category, MountLocation, Part, SceneOptions } from '../shared/types'
import { resolveRadiatorLocation } from '../shared/compatibility'
import { Airflow } from './airflow'
import { batchDetails } from './batching'
import {
  caseFans, chassis, chassisDimensions, cooling, graphics, memory, motherboard, mountableLocations, mountPoints,
  powerCables, powerSupply, processor, storageDrive, type AirMount, type CaseDimensions, type ModelDetail,
} from './models'
import { radialTexture, studioEnvironment, StudioMaterials } from './studio'

interface SceneCallbacks {
  onSelect: (category: Category) => void
  onUnavailable?: (message: string) => void
  onReady?: () => void
  onFanLocationChange?: (location: MountLocation) => void
  onMountBlocked?: (message: string) => void
  onModelStatus?: (part: Part, state: 'loaded' | 'unavailable') => void
}

export interface SceneController {
  setBuild(parts: Part[]): void
  setOptions(options: SceneOptions): void
  focus(category: Category): void
  resetCamera(): void
  showPart(part: Part): void
  play(): void
  dispose(): void
}

const defaults: SceneOptions = {
  mode: 'studio', quality: 'auto', glass: true, powered: true, exploded: 0, airflow: false,
  airflowDirection: 'intake', airflowSpeed: .55, fanLocation: 'front',
  rgbColor: '#a493fa', rgbBrightness: .65, rgbSpeed: .45, rgbEffect: 'static', rgbSync: true, rgbZones: {},
  animationSpeed: 1, animations: true,
}

const positions: Record<Category, [number, number, number]> = {
  case: [.24, -.42, .3],
  gpu: [-2.52, -.16, -.18],
  cpu: [-1.28, .30, .35],
  motherboard: [.62, .39, -.54],
  ram: [-.77, 1.36, .42],
  cooler: [-1.20, 1.36, -.27],
  psu: [-.85, -.63, -.80],
  storage: [-1.20, -.70, .57],
  fan: [-.22, .29, 1.61],
}

const modelAssets: Readonly<Record<string, string>> = {
  'asus-dual-rtx4070-super-oc': '/models/asus-dual-rtx4070-super-oc.glb',
  'nzxt-h5-flow-2024': '/models/nzxt-h5-flow-2024.glb',
}

interface Entry {
  part: Part
  detail: ModelDetail
  anchor: THREE.Vector3
  scatter: THREE.Vector3
  animation: number
  asset: boolean
  removed?: boolean
  modelToken?: symbol
  assetScale?: number
  glassRest: THREE.Vector3
  finishes: { material: THREE.MeshStandardMaterial; base: THREE.Color; light: THREE.Color }[]
}

interface CameraMove {
  target: THREE.Vector3
  eye: THREE.Vector3
}

function disposeObjects(object: THREE.Object3D, withMaterials = false) {
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  object.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      node.geometry.dispose()
      if (node instanceof THREE.InstancedMesh) node.dispose()
      if (withMaterials) {
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material)
      }
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    material.dispose()
  }
  for (const texture of textures) texture.dispose()
  object.removeFromParent()
}

function makeStub(): SceneController {
  return {
    setBuild() { }, setOptions() { }, focus() { }, resetCamera() { }, showPart() { }, play() { }, dispose() { },
  }
}

export function createScene(container: HTMLElement, callbacks: SceneCallbacks): SceneController {
  const canvas = document.createElement('canvas')
  let renderer: THREE.WebGLRenderer
  try {
    const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'high-performance' })
    if (!context) throw new Error('WebGL 2 is unavailable')
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'high-performance' })
  } catch {
    callbacks.onUnavailable?.('3D-сцена недоступна. Подбор комплектующих открыт в облегчённом режиме.')
    return makeStub()
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.34
  renderer.setClearColor(0x11121a, 0)
  canvas.className = 'builder-3d-canvas'
  canvas.style.cssText = 'display:block;width:100%;height:100%;outline-offset:-4px'
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Интерактивная 3D-модель. Стрелки вращают камеру, плюс и минус меняют масштаб, Home возвращает исходный ракурс.')
  container.replaceChildren(canvas)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(33, 1, .06, 95)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = .074
  controls.rotateSpeed = .64
  controls.zoomSpeed = .8
  controls.panSpeed = .85
  controls.minPolarAngle = .035
  controls.maxPolarAngle = Math.PI - .06
  controls.minDistance = .35
  controls.maxDistance = 45
  if (window.matchMedia('(pointer: coarse)').matches) canvas.style.touchAction = 'pan-y'

  const pmrem = new THREE.PMREMGenerator(renderer)
  const studio = studioEnvironment()
  const environment = pmrem.fromEquirectangular(studio)
  studio.dispose()
  pmrem.dispose()
  scene.environment = environment.texture
  scene.environmentIntensity = .66

  const hemi = new THREE.HemisphereLight(0xd2deff, 0x605375, 1.29)
  const key = new THREE.DirectionalLight(0xe9edff, 3.05)
  key.position.set(-5.8, 7.9, 4.1)
  const fill = new THREE.DirectionalLight(0xd9d0ff, 1.03)
  fill.position.set(3.1, 5.9, -5.3)
  const interiorLight = new THREE.PointLight(0xb8aaff, 2.2, 8.2, 1.3)
  interiorLight.position.set(-1.55, 2.7, 1.11)
  const rim = new THREE.DirectionalLight(0x7885d5, .73)
  rim.position.set(-4.4, 3.5, -5.4)
  scene.add(hemi, key, fill, rim, interiorLight)

  const mats = new StudioMaterials()
  const live = new Map<Category, Entry>()
  const outgoing = new Set<Entry>()
  const airflow = new Airflow()
  scene.add(airflow.root)
  airflow.root.visible = false

  const shadowTexture = radialTexture()
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: shadowTexture, transparent: true, opacity: .69, depthWrite: false, toneMapped: false,
  }))
  shadow.rotateX(-Math.PI / 2)
  shadow.position.set(0, -.008, 0)
  shadow.renderOrder = -1
  scene.add(shadow)
  const grid = new THREE.GridHelper(36, 44, 0x67748a, 0x3a4357)
  grid.position.y = -.012
  grid.material.transparent = true
  grid.material.opacity = .35
  grid.visible = false
  scene.add(grid)

  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const raycaster = new THREE.Raycaster()
  const cursor = new THREE.Vector2()
  const baseView = new THREE.Vector3(-.75, .255, .72).normalize()
  const rgb = new THREE.Color()
  const workingColor = new THREE.Color()
  const destination = new THREE.Vector3()
  const focusSize = new THREE.Vector3()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const mobile = window.matchMedia('(max-width: 700px)')
  const mountTarget = new THREE.Vector3()

  let parts: Part[] = []
  let dimensions: CaseDimensions = chassisDimensions()
  let cables: THREE.Group | undefined
  let settings = { ...defaults }
  let mode = settings.mode
  let movie = -1
  let clockSeconds = 0
  let lastPresented = 0
  let disposed = false
  let paused = document.hidden
  let initialized = false
  let contextLost = false
  let detailed = false
  let fitting = true
  let raf = 0
  let cameraMove: CameraMove | undefined
  let power = 0
  let cableIntro = 1
  let autoDensity = mobile.matches ? 1 : 1.55
  let slowFrames = 0
  let interrupted = false

  const animated = () => settings.animations && !reducedMotion.matches
  const fitDistance = () => {
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5))
    const height = dimensions.height / (2 * tangent * .67)
    const width = (dimensions.width * .74 + dimensions.depth * .67) / (2 * tangent * camera.aspect * .89)
    const margin = settings.exploded > 0 && !settings.explodedCategory ? .24 * settings.exploded : 0
    return Math.max(height, width) * (1 + margin)
  }

  const sceneTarget = () => new THREE.Vector3(0, dimensions.height * .453, -.008)

  function moveCamera(target: THREE.Vector3, eye: THREE.Vector3, instant = !animated()) {
    if (instant) {
      controls.target.copy(target)
      camera.position.copy(eye)
      cameraMove = undefined
      controls.update()
    } else cameraMove = { target, eye }
  }

  function resetCamera(instant = !animated()) {
    movie = -1
    fitting = true
    const only = detailed ? live.values().next().value : undefined
    if (only) {
      focusEntry(only, instant)
      return
    }
    const target = sceneTarget()
    moveCamera(target, target.clone().addScaledVector(baseView, fitDistance()), instant)
  }

  function focusEntry(entry: Entry, instant = !animated()) {
    if (!entry.detail.root.visible) return
    const bounds = new THREE.Box3().setFromObject(entry.detail.root)
    const center = bounds.getCenter(new THREE.Vector3())
    bounds.getSize(focusSize)
    if (!Number.isFinite(center.x) || focusSize.lengthSq() < .001) return
    const size = Math.max(focusSize.x, focusSize.y, focusSize.z)
    const radius = Math.max(.65, size * (detailed ? 2.27 : 2.05) / Math.min(1, camera.aspect * 1.32))
    const view = detailed && entry.part.category === 'gpu'
      ? new THREE.Vector3(-.62, -.36, .86).normalize() : baseView
    moveCamera(center, center.clone().addScaledVector(view, radius), instant)
  }

  function focus(category: Category) {
    const entry = live.get(category)
    if (entry) {
      movie = -1
      fitting = false
      focusEntry(entry)
    }
  }

  function drawMode() {
    mode = settings.mode
    grid.visible = mode === 'technical'
    const palette = {
      studio: [0xeaeaff, 0xe0d7ff, 2.65, .89, 1.15],
      light: [0xffffff, 0xbccfff, 3.2, 2.45, 1.26],
      gaming: [0xcdc8ff, 0x725cf4, 2.3, 1.2, 1.17],
      technical: [0xe8eef4, 0xb0bed4, 2.65, 1.74, 1.22],
    }[mode]
    const [main, secondary, intensity, ambient, exposure] = palette
    key.color.setHex(main)
    fill.color.setHex(secondary)
    key.intensity = intensity
    hemi.intensity = ambient
    renderer.toneMappingExposure = exposure
    if (mode === 'light') renderer.setClearColor(0xf0f2f5, 1)
    else if (mode === 'gaming') renderer.setClearColor(0x161324, 1)
    else if (mode === 'technical') renderer.setClearColor(0x1d2532, 1)
    else renderer.setClearColor(0x11121a, 0)
    container.dataset.sceneMode = mode
  }

  function pixelRatio() {
    const ratio = window.devicePixelRatio || 1
    if (settings.quality === 'low') return Math.min(ratio, .8)
    if (settings.quality === 'high') return Math.min(ratio, 2)
    return Math.min(ratio, autoDensity)
  }

  function resize() {
    const { width, height } = container.getBoundingClientRect()
    if (width < 2 || height < 2 || disposed) return
    renderer.setPixelRatio(pixelRatio())
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    if (fitting && movie < 0) resetCamera(true)
  }

  function allowedAsset(part: Part) {
    const source = part.modelUrl || modelAssets[part.id]
    if (!source) return
    try {
      const asset = new URL(source, location.origin)
      if (asset.origin === location.origin && /\.(glb|gltf)$/i.test(asset.pathname)) return asset.pathname + asset.search
    } catch { return }
  }

  function downloadModel(entry: Entry) {
    const source = allowedAsset(entry.part)
    if (!source || !entry.detail.dimensions) return
    const token = Symbol(source)
    entry.modelToken = token
    void loader.loadAsync(source).then((gltf) => {
      if (disposed || entry.removed || entry.modelToken !== token) {
        disposeObjects(gltf.scene, true)
        return
      }
      const bounds = new THREE.Box3().setFromObject(gltf.scene)
      const size = bounds.getSize(new THREE.Vector3())
      const center = bounds.getCenter(new THREE.Vector3())
      const desired = new THREE.Vector3(...entry.detail.dimensions!)
      const scale = Math.min(desired.x / size.x, desired.y / size.y, desired.z / size.z)
      if (!Number.isFinite(scale) || scale <= 0 || size.lengthSq() < .000000001) {
        disposeObjects(gltf.scene, true)
        callbacks.onModelStatus?.(entry.part, 'unavailable')
        return
      }
      const isCase = entry.part.category === 'case'
      const chassisGlass = glassPivot(gltf.scene.getObjectByName('glass'))
      // Keep the procedural chassis when an uploaded enclosure has no separable panel.
      if (isCase && !chassisGlass) {
        disposeObjects(gltf.scene, true)
        callbacks.onModelStatus?.(entry.part, 'unavailable')
        return
      }
      const inner = new THREE.Group()
      inner.scale.setScalar(scale)
      inner.position.copy(center).multiplyScalar(-scale)
      if (isCase) inner.position.y += desired.y / 2
      inner.add(gltf.scene)
      const holder = entry.detail.root
      for (const child of [...holder.children]) disposeObjects(child)
      for (const light of entry.detail.lights) light.material.dispose()
      for (const material of entry.detail.ownedMaterials ?? []) material.dispose()
      entry.detail.ownedMaterials = []
      entry.detail.lights = []
      const finishes = new Set<THREE.MeshStandardMaterial>()
      entry.detail.rotors = []
      entry.detail.glass = chassisGlass
      if (chassisGlass) entry.glassRest.copy(chassisGlass.position)
      gltf.scene.traverse((object) => {
        if (/^rotor-\d+$/.test(object.name)) entry.detail.rotors.push({ node: object, axis: 'y' })
        if (!(object instanceof THREE.Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (material.transparent) {
            material.depthWrite = false
            if (isCase) {
              object.renderOrder = 7
              material.opacity *= .40
              material.forceSinglePass = true
            }
          }
          if (isCase && material instanceof THREE.MeshStandardMaterial && /shell-coated|frame-rail|perforated|rear-steel|tray-stamped/.test(material.name)) finishes.add(material)
          if (material instanceof THREE.MeshStandardMaterial && /case-power-button|status led|rgb zone/i.test(material.name)) {
            material.emissiveIntensity = 0
            entry.detail.lights.push({ material })
          }
        }
      })
      holder.add(inner)
      entry.finishes = [...finishes].map((material) => {
        const luminance = .24 * material.color.r + .65 * material.color.g + .11 * material.color.b
        return { material, base: material.color.clone(), light: mats.finish('white').color.clone().multiplyScalar(.73 + luminance * 2.63) }
      })
      entry.asset = true
      entry.assetScale = scale
      callbacks.onModelStatus?.(entry.part, 'loaded')
      if (detailed && fitting) focusEntry(entry, true)
    }).catch(() => {
      if (!disposed && !entry.removed && entry.modelToken === token) callbacks.onModelStatus?.(entry.part, 'unavailable')
    })
  }

  function byCategory(category: Category) {
    return parts.find((part) => part.category === category)
  }

  function selectedRadiator(
    enclosure?: Part,
    cooler?: Part,
    ram?: Part,
    gpu?: Part,
    fan?: Part,
    fanLocation = settings.fanLocation,
  ) {
    return resolveRadiatorLocation(enclosure, cooler, ram, gpu, { fan, fanLocation })
      ?? resolveRadiatorLocation(enclosure, cooler, ram, gpu)
  }

  function updateAirflow() {
    const mounts = live.get('fan')?.detail.mounts ?? []
    airflow.update(mounts, dimensions, settings)
    airflow.root.visible = settings.airflow && !detailed && mounts.length > 0
  }

  function rebuild(force: Set<Category> = new Set()) {
    const casing = byCategory('case')
    const mainboard = byCategory('motherboard')
    const cooler = byCategory('cooler')
    const fan = byCategory('fan')
    const nominal = cooler?.specs.radiatorMm
    const radiatorMount = detailed && nominal ? 'top' : selectedRadiator(casing, cooler, byCategory('ram'), byCategory('gpu'), fan)
    const radiator = radiatorMount && nominal ? { location: radiatorMount, size: nominal } : undefined
    const before = dimensions
    dimensions = chassisDimensions(casing, mainboard)
    shadow.scale.set(dimensions.width * 2.25, dimensions.depth * 1.85, 1)
    shadow.visible = !detailed && Boolean(casing)
    interiorLight.position.set(dimensions.left - .35, dimensions.height * .62, dimensions.front * .24)
    const partIds = new Set(parts.map((part) => part.category))
    let anyChange = false

    for (const [category, entry] of live) {
      const part = byCategory(category)
      const differs = !partIds.has(category) || part !== entry.part || force.has(category)
      if (!differs) continue
      live.delete(category)
      entry.removed = true
      anyChange = true
      if (animated() && !detailed) {
        entry.animation = Math.max(0, entry.animation)
        outgoing.add(entry)
      } else disposeEntry(entry)
    }

    for (const part of parts) {
      const { category } = part
      if (live.has(category)) continue
      let detail: ModelDetail
      switch (category) {
        case 'case': {
          const caseDetail = chassis(part, dimensions, mats)
          caseDetail.lights.push({ material: caseDetail.powerIndicator })
          detail = caseDetail
          break
        }
        case 'motherboard': detail = motherboard(part, dimensions, mats); break
        case 'cpu': detail = processor(part, dimensions, mats, mainboard); break
        case 'gpu': detail = graphics(part, dimensions, mats, mainboard); break
        case 'ram': detail = memory(part, dimensions, mats, mainboard); break
        case 'cooler': detail = cooling(part, dimensions, mats, mainboard, radiatorMount); break
        case 'psu': detail = powerSupply(part, dimensions, mats); break
        case 'storage': detail = storageDrive(part, dimensions, mats, mainboard); break
        case 'fan': detail = caseFans(part, casing, dimensions, mats, settings, radiator); break
      }
      const root = detail.root
      const movable = new Set<THREE.Object3D>(detail.rotors.map((rotor) => rotor.node))
      if (detail.glass) movable.add(detail.glass)
      batchDetails(root, movable)
      const pendingSwap = [...outgoing].some((out) => out.part.category === category)
      const anchor = root.position.clone().add(offset(part))
      if (typeof part.specs.mountRotationDeg === 'number' && Number.isFinite(part.specs.mountRotationDeg)) {
        root.rotateY(THREE.MathUtils.degToRad(part.specs.mountRotationDeg))
      }
      const scatter = new THREE.Vector3(...positions[category])
      const entry: Entry = {
        detail, anchor, scatter, part, asset: false,
        animation: animated() && !detailed ? pendingSwap ? 1.07 : .50 : 0,
        glassRest: detail.glass?.position.clone() ?? new THREE.Vector3(),
        finishes: (detail.finishMaterials ?? []).map((material) => ({
          material, base: material.color.clone(), light: mats.finish('white').color.clone(),
        })),
      }
      root.position.copy(anchor).addScaledVector(scatter, .63 * Math.min(1, entry.animation))
      root.userData.category = category
      root.name = part.id
      root.visible = !settings.hiddenCategories?.includes(category)
      live.set(category, entry)
      scene.add(root)
      if (detail.mounts) {
        const extraOffset = offset(part)
        detail.mounts = detail.mounts.map((m) => ({ ...m, center: m.center.clone().applyQuaternion(root.quaternion).add(extraOffset), interior: m.interior.clone().applyQuaternion(root.quaternion) }))
      }
      downloadModel(entry)
      anyChange = true
    }

    if (anyChange) {
      if (cables) disposeObjects(cables)
      const gpu = live.get('gpu')
      const psu = live.get('psu')
      const gpuProxy = gpu ? new THREE.Group() : undefined
      if (gpu && gpuProxy) gpuProxy.position.copy(gpu.anchor)
      cables = powerCables(dimensions, mats, gpuProxy, psu?.detail.root, mainboard)
      batchDetails(cables)
      cables.visible = !detailed
      cableIntro = animated() ? .3 : 1
      scene.add(cables)
      updateAirflow()
    }
    if ((!initialized || dimensions.width !== before.width || dimensions.height !== before.height || dimensions.depth !== before.depth) && fitting && !detailed) {
      resetCamera(!initialized)
    }
  }

  function disposeEntry(entry: Entry) {
    if (!entry.asset) {
      for (const light of entry.detail.lights) light.material.dispose()
      for (const material of entry.detail.ownedMaterials ?? []) material.dispose()
    }
    disposeObjects(entry.detail.root, entry.asset)
  }

  function setBuild(newParts: Part[]) {
    const next = (category: Category) => newParts.find((part) => part.category === category)
    const caseChanged = byCategory('case') !== next('case')
    const boardChanged = byCategory('motherboard') !== next('motherboard')
    const coolerChanged = byCategory('cooler') !== next('cooler')
    const lastRadiator = selectedRadiator(byCategory('case'), byCategory('cooler'), byCategory('ram'), byCategory('gpu'), byCategory('fan'))
    const nextRadiator = selectedRadiator(next('case'), next('cooler'), next('ram'), next('gpu'), next('fan'))
    const force = new Set<Category>()
    if (caseChanged || boardChanged) for (const part of newParts) force.add(part.category)
    if (coolerChanged || lastRadiator !== nextRadiator) force.add('fan')
    if (lastRadiator !== nextRadiator) force.add('cooler')
    const leavingDetail = detailed
    parts = newParts
    detailed = false
    rebuild(force)
    if (leavingDetail) resetCamera()
  }

  function setOptions(options: SceneOptions) {
    const prior = settings
    settings = { ...defaults, ...options }
    if (settings.mode !== mode) drawMode()
    if (settings.quality !== prior.quality) resize()
    if (fitting && !detailed && (settings.exploded !== prior.exploded || settings.explodedCategory !== prior.explodedCategory)) resetCamera()
    const dirty = new Set<Category>()
    const fanMoved = settings.fanLocation !== prior.fanLocation || settings.airflowDirection !== prior.airflowDirection
    if (fanMoved) dirty.add('fan')
    if (settings.fanLocation !== prior.fanLocation) {
      const context = [byCategory('case'), byCategory('cooler'), byCategory('ram'), byCategory('gpu'), byCategory('fan')] as const
      if (selectedRadiator(...context, settings.fanLocation) !== selectedRadiator(...context, prior.fanLocation)) dirty.add('cooler')
    }
    if (dirty.size > 0) rebuild(dirty)
    else if (settings.airflow !== prior.airflow) updateAirflow()
    for (const [category, entry] of live) entry.detail.root.visible = !settings.hiddenCategories?.includes(category)
    if (!animated()) movie = -1
  }

  function showPart(part: Part) {
    parts = [part]
    detailed = true
    fitting = true
    rebuild(new Set<Category>([part.category]))
    updateAirflow()
    const entry = live.get(part.category)
    if (entry) focusEntry(entry, true)
  }

  function play() {
    if (!animated()) {
      resetCamera(true)
      return
    }
    cameraMove = undefined
    movie = 0
  }

  function updateRgb(entry: Entry, offset: number, delta: number) {
    const { part, detail } = entry
    for (const [index, { material, location: fanLocation }] of detail.lights.entries()) {
      const zone = fanLocation ? settings.fanColors?.[fanLocation] ?? settings.rgbZones[part.category] : settings.rgbZones[part.category]
      const isPowerIndicator = part.category === 'case' && !part.specs.rgb
      const isCustom = settings.rgbEffect === 'custom'
      const base = settings.rgbSync && !isCustom ? settings.rgbColor : zone ?? settings.rgbColor
      const intensity = isPowerIndicator ? .7 : settings.rgbBrightness * 2.1
      rgb.set(base)
      if (isPowerIndicator) rgb.setHex(0xc0c9ec)
      let pulse = 1
      if (animated() && !isPowerIndicator) {
        const rate = clockSeconds * (settings.rgbSpeed + .16)
        const stack = offset * .6 + index * .42
        switch (settings.rgbEffect) {
          case 'breathing': pulse = .35 + Math.sin(rate * 3.5) * .34 + .34; break
          case 'wave': pulse = .46 + (Math.sin(rate * 5.5 - stack) + 1) * .27; break
          case 'rainbow': rgb.setHSL((rate * .19 + stack * .046) % 1, .75, .56); break
          case 'sequence': pulse = ((rate * .75 - stack * .23) % 1 + 1) % 1 < .5 ? 1 : .22; break
          case 'transition': rgb.lerp(workingColor.set(settings.rgbZones.cooler ?? '#64d9de'), (Math.sin(rate * 3.9) + 1) * .5); break
        }
      }
      const blend = animated() ? 1 - Math.exp(-delta * 14) : 1
      material.emissive.lerp(rgb, blend)
      material.color.lerp(workingColor.copy(rgb).multiplyScalar(.37), blend)
      material.emissiveIntensity = THREE.MathUtils.lerp(material.emissiveIntensity, intensity * power * pulse, blend)
    }
  }

  function draw(timeMs: number) {
    if (disposed || paused || contextLost) {
      raf = 0
      return
    }
    const elapsed = lastPresented > 0 ? Math.min((timeMs - lastPresented) / 1000, 1) : .016
    const speed = THREE.MathUtils.clamp(settings.animationSpeed, .5, 2)
    const delta = elapsed * speed
    clockSeconds += delta
    const interpolation = animated() ? 1 - Math.exp(-delta * 7) : 1
    const powerInterpolation = animated() ? 1 - Math.exp(-delta * (settings.powered ? 3.8 : 7)) : 1
    power = THREE.MathUtils.lerp(power, Number(settings.powered), powerInterpolation)
    const removingGlass = settings.separatedGlass ?? false
    const exploded = detailed ? 0 : settings.exploded
    const cameraDelta = Math.min(elapsed * 5.5, 1)

    let film = 0
    if (movie >= 0) {
      movie += delta
      const phase = movie / 8.5
      if (phase >= 1) {
        movie = -1
        resetCamera()
      } else {
        film = Math.sin(Math.PI * phase) ** 2 * .58
        const phi = .80 + phase * (Math.PI * 2)
        const mid = sceneTarget()
        const radius = fitDistance() * (1 + film * .23)
        destination.set(-Math.sin(phi) * radius, radius * (.255 + film * .1), Math.cos(phi) * radius).add(mid)
        camera.position.lerp(destination, Math.min(1, elapsed * 4.6))
        controls.target.lerp(mid, cameraDelta)
      }
    }

    if (cameraMove) {
      const factor = 1 - Math.exp(-elapsed * 5.7)
      camera.position.lerp(cameraMove.eye, factor)
      controls.target.lerp(cameraMove.target, factor)
      if (camera.position.distanceToSquared(cameraMove.eye) + controls.target.distanceToSquared(cameraMove.target) < .000018) {
        camera.position.copy(cameraMove.eye)
        controls.target.copy(cameraMove.target)
        cameraMove = undefined
      }
    }
    controls.update(Math.min(elapsed, .11))

    let lightOffset = 0
    for (const entry of live.values()) {
      const { detail, anchor, scatter, part } = entry
      entry.animation = animated() ? Math.max(0, entry.animation - delta * 2.8) : 0
      const arrival = Math.min(entry.animation, 1) ** 1.4
      const amount = !settings.explodedCategory || settings.explodedCategory === part.category
        ? Math.max(exploded, film) : 0
      const shift = (amount + arrival * .66)
      const repel = detailed ? 0 : shift
      destination.copy(anchor).addScaledVector(scatter, repel)
      detail.root.position.lerp(destination, interpolation)
      if (detail.glass) {
        const glass = detail.glass
        const separation = removingGlass ? .93 : 0
        const slide = Math.min(1.7, amount * 1.2 + separation)
        const unit = entry.assetScale ?? 1
        const angle = settings.glass ? 0 : -.72
        glass.rotation.y = THREE.MathUtils.lerp(glass.rotation.y, angle, interpolation)
        glass.position.x = THREE.MathUtils.lerp(glass.position.x, entry.glassRest.x - slide / unit, interpolation)
        glass.position.y = THREE.MathUtils.lerp(glass.position.y, entry.glassRest.y + slide * .38 / unit, interpolation)
      }
      for (const rotor of detail.rotors) {
        const speed = rotor.location && settings.airflow ? .95 + settings.airflowSpeed * 1.8 : 1.2
        if (animated()) rotor.node.rotateOnAxis(rotor.axis === 'y' ? up : zAxis, Math.min(delta, .25) * 10 * power * speed)
      }
      if (part.category === 'case') {
        const lightFinish = settings.finish !== part.colors[0] && /white|бел|silver|сереб/i.test(settings.finish ?? '')
        for (const { material, base, light } of entry.finishes) material.color.lerp(lightFinish ? light : base, interpolation)
      }
      updateRgb(entry, lightOffset++, delta)
    }
    for (const entry of outgoing) {
      entry.animation += delta * 3.4
      const distance = Math.min(entry.animation, 1.27)
      entry.detail.root.position.lerp(destination.copy(entry.anchor).addScaledVector(entry.scatter, distance * 1.45), interpolation)
      if (entry.animation >= 1.27 || !animated()) {
        disposeEntry(entry)
        outgoing.delete(entry)
      }
    }
    if (cables) {
      const gpuHidden = settings.hiddenCategories?.includes('gpu') || settings.hiddenCategories?.includes('psu')
      cables.visible = exploded < .47 && film < .42 && outgoing.size < 1 && !detailed && !gpuHidden
      cableIntro = Math.min(1, cableIntro + delta * 1.65)
      cables.position.z = animated() ? (1 - cableIntro) ** 2 * .7 : 0
    }
    interiorLight.intensity = .34 + power * (mode === 'gaming' ? 3.8 : 2.1) * settings.rgbBrightness
    interiorLight.color.set(settings.rgbColor).lerp(workingColor.setHex(0xc9d0f0), .32)
    airflow.tick(clockSeconds, settings.airflowSpeed * .85 + .18, animated())
    renderer.render(scene, camera)
    if (!initialized) {
      initialized = true
      callbacks.onReady?.()
    }

    if (settings.quality === 'auto' && timeMs - lastPresented > 38) {
      slowFrames++
      if (slowFrames > 30 && autoDensity > .8) {
        autoDensity = Math.max(.8, autoDensity - .22)
        slowFrames = 0
        renderer.setPixelRatio(pixelRatio())
      }
    } else slowFrames = Math.max(0, slowFrames - 1)
    lastPresented = timeMs
    raf = requestAnimationFrame(draw)
  }

  function pick(event: PointerEvent) {
    const boundary = canvas.getBoundingClientRect()
    cursor.set(((event.clientX - boundary.left) / boundary.width) * 2 - 1, -((event.clientY - boundary.top) / boundary.height) * 2 + 1)
    raycaster.setFromCamera(cursor, camera)
    const hitList = raycaster.intersectObjects([...live.values()].map((entry) => entry.detail.root), true)
    for (const { object } of hitList) {
      let parent: THREE.Object3D | null = object
      let ignored = false
      while (parent && parent !== scene) {
        if (!parent.visible || /glass/i.test(parent.name)) {
          ignored = true
          break
        }
        const category = parent.userData.category as Category | undefined
        if (category) return category
        parent = parent.parent
      }
      if (ignored) continue
    }
  }

  function nearestMount(event: PointerEvent, mounts: AirMount[]): MountLocation | undefined {
    const bounds = canvas.getBoundingClientRect()
    const reference = new THREE.Vector2(event.clientX - bounds.left, event.clientY - bounds.top)
    let nearest: MountLocation | undefined
    let minimum = Infinity
    for (const { location, center } of mounts) {
      mountTarget.copy(center).project(camera)
      const point = new THREE.Vector2((mountTarget.x * .5 + .5) * bounds.width, (-mountTarget.y * .5 + .5) * bounds.height)
      const gap = point.distanceTo(reference)
      if (gap < minimum && gap < 80) {
        minimum = gap
        nearest = location
      }
    }
    return nearest
  }

  let clickStart: { x: number; y: number; id: number } | undefined
  let fanDrag = false

  function pointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    clickStart = { x: event.clientX, y: event.clientY, id: event.pointerId }
    const shouldCaptureFan = event.shiftKey && callbacks.onFanLocationChange && pick(event) === 'fan'
    if (shouldCaptureFan) {
      fanDrag = true
      controls.enabled = false
      canvas.setPointerCapture(event.pointerId)
      canvas.style.cursor = 'grabbing'
    }
    cameraMove = undefined
    movie = -1
  }

  function pointerUp(event: PointerEvent) {
    if (!clickStart || clickStart.id !== event.pointerId) return
    const gap = Math.hypot(clickStart.x - event.clientX, clickStart.y - event.clientY)
    clickStart = undefined
    if (fanDrag) {
      const fan = byCategory('fan')
      const casing = byCategory('case')
      const cooler = byCategory('cooler')
      const ram = byCategory('ram')
      const gpu = byCategory('gpu')
      const allowed = mountableLocations(casing, fan, cooler, ram, gpu)
      const destinations = fan && casing ? allowed.flatMap(fanLocation => {
        const location = selectedRadiator(casing, cooler, ram, gpu, fan, fanLocation)
        const size = cooler?.specs.radiatorMm
        const radiator = location && size ? { location, size } : undefined
        return mountPoints(casing, dimensions, (fan.specs.fanSizeMm ?? 120) / 100, radiator).filter((mount) => mount.location === fanLocation)
      }) : []
      const location = nearestMount(event, destinations)
      if (location) callbacks.onFanLocationChange?.(location)
      else callbacks.onMountBlocked?.('Перетащите вентилятор к свободному креплению подходящего размера.')
      cancelDrag()
    } else if (gap < 6) {
      const category = pick(event)
      if (category) callbacks.onSelect(category)
    }
  }

  function cancelDrag() {
    if (!fanDrag) return
    fanDrag = false
    controls.enabled = true
    canvas.style.cursor = ''
  }

  function keyboard(event: KeyboardEvent) {
    const physicalKey = event.key
    if (physicalKey === 'Home' || physicalKey === '0') {
      event.preventDefault()
      resetCamera()
      return
    }
    const factors: Record<string, [number, number, number]> = {
      ArrowLeft: [-.12, 0, 1], ArrowRight: [.12, 0, 1],
      ArrowUp: [0, -.10, 1], ArrowDown: [0, .10, 1],
      '+': [0, 0, .89], '=': [0, 0, .89], '-': [0, 0, 1.13],
    }
    if (!factors[physicalKey]) return
    event.preventDefault()
    const [theta, phi, radius] = factors[physicalKey]
    movie = -1
    cameraMove = undefined
    fitting = false
    const relative = camera.position.clone().sub(controls.target)
    const orbit = new THREE.Spherical().setFromVector3(relative)
    orbit.theta += theta
    orbit.phi += phi
    orbit.makeSafe()
    orbit.radius = THREE.MathUtils.clamp(orbit.radius * radius, controls.minDistance, controls.maxDistance)
    camera.position.setFromSpherical(orbit).add(controls.target)
    controls.update()
  }

  const controlStart = () => {
    cameraMove = undefined
    movie = -1
    fitting = false
  }

  function visibility() {
    paused = document.hidden
    if (paused && raf) {
      cancelAnimationFrame(raf)
      raf = 0
      lastPresented = 0
    } else if (!paused && !raf && !contextLost && !disposed) {
      raf = requestAnimationFrame(draw)
    }
  }

  function lost(event: Event) {
    event.preventDefault()
    contextLost = true
    interrupted = true
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    callbacks.onUnavailable?.('Графический контекст был потерян. Комплектацию можно менять без 3D-сцены.')
  }

  function restored() {
    contextLost = false
    if (interrupted) {
      initialized = false
      visibility()
    }
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  controls.addEventListener('start', controlStart)
  canvas.addEventListener('pointerdown', pointerDown, true)
  canvas.addEventListener('pointerup', pointerUp, true)
  canvas.addEventListener('pointercancel', cancelDrag)
  canvas.addEventListener('keydown', keyboard)
  canvas.addEventListener('webglcontextlost', lost)
  canvas.addEventListener('webglcontextrestored', restored)
  document.addEventListener('visibilitychange', visibility)
  drawMode()
  resetCamera(true)
  resize()
  visibility()

  function dispose() {
    if (disposed) return
    disposed = true
    if (raf) cancelAnimationFrame(raf)
    observer.disconnect()
    controls.dispose()
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('pointerdown', pointerDown, true)
    canvas.removeEventListener('pointerup', pointerUp, true)
    canvas.removeEventListener('pointercancel', cancelDrag)
    canvas.removeEventListener('keydown', keyboard)
    canvas.removeEventListener('webglcontextlost', lost)
    canvas.removeEventListener('webglcontextrestored', restored)
    for (const entry of live.values()) {
      entry.removed = true
      disposeEntry(entry)
    }
    for (const entry of outgoing) disposeEntry(entry)
    if (cables) disposeObjects(cables)
    airflow.clear()
    mats.dispose()
    grid.geometry.dispose()
    grid.material.dispose()
    shadow.geometry.dispose()
    shadow.material.dispose()
    shadowTexture.dispose()
    environment.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return { setBuild, setOptions, focus, resetCamera: () => resetCamera(), showPart, play, dispose }
}

function glassPivot(panel: THREE.Object3D | undefined) {
  if (!panel?.parent) return panel
  const parent = panel.parent
  const bounds = new THREE.Box3().setFromObject(panel)
  const center = bounds.getCenter(new THREE.Vector3())
  const hinge = new THREE.Group()
  hinge.name = 'glass-panel-hinge'
  hinge.position.copy(parent.worldToLocal(new THREE.Vector3(bounds.min.x, center.y, bounds.min.z)))
  parent.add(hinge)
  hinge.attach(panel)
  return hinge
}

const up = new THREE.Vector3(0, 1, 0)
const zAxis = new THREE.Vector3(0, 0, 1)

function offset(part: Part) {
  const custom = part.specs.mountOffsetMm
  if (!custom || typeof custom !== 'object') return new THREE.Vector3()
  const value = custom as Record<string, unknown>
  const coordinate = (axis: string) => typeof value[axis] === 'number' && Number.isFinite(value[axis]) ? value[axis] / 100 : 0
  return new THREE.Vector3(coordinate('x'), coordinate('y'), coordinate('z'))
}

export { mountableLocations } from './models'
