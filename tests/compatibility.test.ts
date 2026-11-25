import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeBuild } from '../src/shared/analysis.ts'
import { catalog as productCatalog, presets } from '../src/shared/catalog.ts'
import { checkCompatibility, createCompatibilityChecker, findCompatibleAlternatives, resolveRadiatorLocation } from '../src/shared/compatibility.ts'
import type { Build, Category, Part, Specs } from '../src/shared/types.ts'

function part(id: string, category: Category, specs: Specs, dimensions?: Part['dimensions']): Part {
  return {
    id, category, name: id, brand: 'Test', model: id, price: 1000, priceStatus: 'demo', inStock: true,
    colors: ['black'], source: 'https://example.test', checkedAt: '2026-11-26', specs, dimensions,
  }
}

const casePart = part('case', 'case', {
  formFactors: ['ATX', 'Micro-ATX'],
  gpuClearanceMm: 300,
  gpuHeightClearanceMm: 135,
  gpuSlotClearance: 2.5,
  gpuThicknessClearanceMm: 52,
  coolerClearanceMm: 160,
  psuClearanceMm: 155,
  psuFormFactors: ['ATX'],
  fanMounts: [
    { location: 'front', quantity: 2, fanSizes: [120, 140], radiatorSizes: [240, 280] },
    { location: 'top', quantity: 2, fanSizes: [120], radiatorSizes: [240] },
    { location: 'rear', quantity: 1, fanSizes: [120], radiatorSizes: [] },
  ],
  storageMounts: 2,
  radiatorStackClearanceMm: { front: 55, top: 55 },
  gpuClearanceWithFrontRadiatorMm: 270,
})

const cpu = part('cpu', 'cpu', { socket: 'AM5', family: 'Ryzen 7000', wattage: 105, maxPowerW: 140, threads: 16 })
const motherboard = part('board', 'motherboard', {
  socket: 'AM5',
  formFactor: 'ATX',
  memoryType: 'DDR5',
  memorySlots: 2,
  maxMemoryGb: 96,
  cpuFamilies: ['Ryzen 7000'],
  bios: '2.10',
  biosRequired: { cpu: '2.9' },
  storagePorts: { 'M.2 NVMe': 1, SATA: 0, 'M.2 SATA': 0 },
  m2LengthsMm: [80],
  powerConnectors: { 'ATX 24-pin': 1, 'EPS 8-pin': 1 },
})
const ram = part('ram', 'ram', { memoryType: 'DDR5', memoryModules: 2, capacityGb: 32 }, { width: 140, height: 33, depth: 5 })
const gpu = part('gpu', 'gpu', {
  wattage: 160, recommendedPsuWatts: 550, gpuChip: 'RTX 4060 TI', vramGb: 8, gpuSlots: 2.5,
  powerConnectors: { 'PCIe 8-pin': 1 }, encoder: 'AV1',
}, { width: 300, height: 135, depth: 52 })
const cooler = part('cooler', 'cooler', { sockets: ['AM5'], coolerHeightMm: 160, ramClearanceMm: 33 })
const psu = part('psu', 'psu', {
  psuWatts: 550, psuLengthMm: 155, psuFormFactor: 'ATX',
  connectors: { 'PCIe 6+2': 2, 'CPU 4+4': 1, 'ATX 20+4': 1 },
})
const storage = part('storage', 'storage', { storageInterface: 'M.2 NVMe', storageLengthMm: 80, capacityGb: 1000 })
const fan = part('fan', 'fan', { fanSizeMm: 120, fanCount: 1 })
const catalog = [casePart, gpu, cpu, motherboard, ram, cooler, psu, storage, fan]
const build = Object.fromEntries(catalog.map(entry => [entry.category, entry.id])) as Build

function replaced(replacement: Part): Part[] {
  return catalog.map(entry => entry.category === replacement.category ? replacement : entry)
}

test('confirmed compatibility accepts exactly fitting GPU, cooler, memory and PSU dimensions', () => {
  const report = checkCompatibility(build, catalog)
  assert.equal(report.status, 'compatible')
  assert.equal(report.estimatedWatts, 360)
  assert.equal(report.recommendedPsuWatts, 550)
  assert.ok(report.checked.some(issue => issue.code === 'gpu-thickness'))
  assert.ok(report.checked.some(issue => issue.code === 'bios-version'))
  assert.deepEqual(report.issues, [])
})

test('CPU socket mismatch blocks the build while an unknown socket stays a warning', () => {
  const wrong = checkCompatibility(build, replaced({ ...cpu, specs: { ...cpu.specs, socket: 'LGA1700' } }))
  assert.ok(wrong.issues.some(issue => issue.code === 'cpu-socket' && issue.severity === 'incompatible'))
  const unknown = checkCompatibility(build, replaced({ ...cpu, specs: { ...cpu.specs, socket: undefined } }))
  assert.equal(unknown.status, 'warning')
  assert.ok(unknown.issues.some(issue => issue.code === 'cpu-socket'))
})

test('specific motherboard CPU support takes precedence over its listed families', () => {
  const board = { ...motherboard, specs: { ...motherboard.specs, cpuFamilies: ['Ryzen 9000'] } }
  assert.equal(checkCompatibility(build, replaced(board)).status, 'compatible')
  board.specs.biosRequired = {}
  assert.ok(checkCompatibility(build, replaced(board)).issues.some(issue => issue.code === 'cpu-family' && issue.severity === 'incompatible'))
})

test('older BIOS is incompatible and board-prefixed alphanumeric BIOS is ordered only within its board revision', () => {
  const boardWithBios = (bios: string | undefined, required: string) => ({
    ...motherboard, specs: { ...motherboard.specs, bios, biosRequired: { cpu: required } },
  })
  assert.equal(checkCompatibility(build, replaced(boardWithBios('2.8', '2.9'))).status, 'incompatible')
  assert.equal(checkCompatibility(build, replaced(boardWithBios('7D75v1G', '7D75v1B'))).status, 'compatible')
  assert.equal(checkCompatibility(build, replaced(boardWithBios('7D76v1G', '7D75v1B'))).status, 'warning')
  assert.equal(checkCompatibility(build, replaced(boardWithBios(undefined, '2.9'))).status, 'warning')
})

test('ram type, slot usage, capacity and cooler clearance generate separate hard conflicts', () => {
  const report = checkCompatibility(build, replaced({
    ...ram, specs: { ...ram.specs, memoryType: 'DDR4', memoryModules: 4, capacityGb: 128 },
    dimensions: { width: 140, height: 34, depth: 5 },
  }))
  assert.deepEqual(report.issues.map(issue => issue.code), ['ram-type', 'ram-slots', 'ram-capacity', 'cooler-ram'])
})

test('case limits reject an extra millimeter and an extra occupied slot fraction', () => {
  const report = checkCompatibility(build, replaced({
    ...gpu, specs: { ...gpu.specs, gpuSlots: 2.6 },
    dimensions: { width: 301, height: 136, depth: 53 },
  }))
  assert.deepEqual(report.issues.map(issue => issue.code), ['gpu-length', 'gpu-height', 'gpu-slots', 'gpu-thickness'])
})

test('a front-only radiator can conflict with card length and consume requested fan placement', () => {
  const radiator = { ...cooler, specs: { sockets: ['AM5'] as ('AM5')[], radiatorMm: 240, radiatorThicknessMm: 30, radiatorFanThicknessMm: 25 } }
  const front = checkCompatibility(build, replaced(radiator), { radiatorLocation: 'front', fanLocation: 'front' })
  assert.deepEqual(front.issues.map(issue => issue.code), ['gpu-front-radiator', 'fan-radiator-conflict'])
  assert.equal(checkCompatibility(build, replaced(radiator), { radiatorLocation: 'top', fanLocation: 'front' }).status, 'compatible')
  const absent = checkCompatibility(build, replaced(radiator), { radiatorLocation: 'rear' })
  assert.ok(absent.issues.some(issue => issue.code === 'radiator-mount' && issue.severity === 'incompatible'))
})

test('incomplete data on radiator brackets is distinguished from explicit no-fit', () => {
  const enclosure = {
    ...casePart,
    specs: { ...casePart.specs, fanMounts: [{ location: 'front' as const, quantity: 2, fanSizes: [120] }] },
  }
  const water = { ...cooler, specs: { sockets: ['AM5'] as ('AM5')[], radiatorMm: 240 } }
  const mixedCatalog = [enclosure, ...replaced(water).slice(1)]
  assert.ok(checkCompatibility(build, mixedCatalog).issues.some(issue => issue.code === 'radiator-mount' && issue.severity === 'warning'))
  assert.ok(checkCompatibility(build, mixedCatalog, { radiatorLocation: 'top' }).issues.some(issue => issue.code === 'radiator-mount' && issue.severity === 'incompatible'))
})

test('radiator resolver prefers a physically validated location to top-only nominal support', () => {
  const enclosure = {
    ...casePart, specs: { ...casePart.specs, radiatorStackClearanceMm: { top: 40, front: 55 }, gpuClearanceWithFrontRadiatorMm: 300 },
  }
  const water = { ...cooler, specs: { sockets: ['AM5'] as ('AM5')[], radiatorMm: 240, radiatorThicknessMm: 30, fanThicknessMm: 25 } }
  assert.equal(resolveRadiatorLocation(enclosure, water, ram, gpu), 'front')
  assert.equal(resolveRadiatorLocation(casePart, water, ram, gpu), 'top')
  assert.equal(resolveRadiatorLocation(enclosure, { ...water, specs: { ...water.specs, radiatorThicknessMm: 60 } }, ram, gpu), undefined)
})

test('radiator resolver keeps the selected fan mount clear and rejects any arrangement with disjoint fit checks', () => {
  const water = { ...cooler, specs: { sockets: ['AM5'] as ('AM5')[], radiatorMm: 240, radiatorThicknessMm: 30, fanThicknessMm: 25 } }
  const enclosure = { ...casePart, specs: { ...casePart.specs, gpuClearanceWithFrontRadiatorMm: 300 } }
  assert.equal(resolveRadiatorLocation(enclosure, water, ram, gpu, { fan, fanLocation: 'top' }), 'front')
  assert.equal(resolveRadiatorLocation(casePart, water, ram, gpu, { fan, fanLocation: 'top' }), undefined)
  const incompatible = { ...casePart, specs: { ...casePart.specs, radiatorStackClearanceMm: { top: 40, front: 55 } } }
  assert.equal(resolveRadiatorLocation(incompatible, water, ram, gpu), undefined)
  const report = checkCompatibility(build, [incompatible, ...replaced(water).slice(1)])
  assert.ok(report.issues.some(issue => issue.code === 'radiator-layout' && issue.severity === 'incompatible'))
})

test('fan size limits apply independently from mount capacity for a different fan size', () => {
  const frontMount = { location: 'front' as const, quantity: 3, fanSizes: [120, 140], fanSizeLimits: { 140: 2 } }
  const enclosure: Part = {
    ...casePart,
    specs: { ...casePart.specs, fanMounts: [frontMount] },
  }
  const pack = { ...fan, specs: { ...fan.specs, fanCount: 3, fanSizeMm: 140 } }
  const report = checkCompatibility(build, [enclosure, ...replaced(pack).slice(1)], { fanLocation: 'front' })
  assert.ok(report.issues.some(issue => issue.code === 'fan-mount' && issue.severity === 'incompatible'))
})

test('PSU aliases resolve without assuming missing adapter plugs or overlooking physical cable clearance', () => {
  const gpu16 = { ...gpu, specs: { ...gpu.specs, powerConnectors: { '12VHPWR': 1 }, adapterPcie8PinCount: 2 } }
  const reportWithAdapter = checkCompatibility(build, replaced(gpu16))
  assert.equal(reportWithAdapter.status, 'warning')
  assert.ok(reportWithAdapter.checked.some(issue => issue.code === 'gpu-power-connectors'))
  assert.ok(reportWithAdapter.issues.some(issue => issue.code === 'gpu-cable-clearance'))
  const gpuWithoutAdapter = { ...gpu16, specs: { ...gpu16.specs, adapterPcie8PinCount: undefined } }
  assert.ok(checkCompatibility(build, replaced(gpuWithoutAdapter)).issues.some(issue => issue.code === 'gpu-power-connectors' && issue.severity === 'incompatible'))
})

test('PSU wattage below known power is incompatible, while below calculated headroom is a warning', () => {
  const supply = (watts: number) => replaced({ ...psu, specs: { ...psu.specs, psuWatts: watts } })
  assert.ok(checkCompatibility(build, supply(299)).issues.some(issue => issue.code === 'psu-insufficient' && issue.severity === 'incompatible'))
  assert.ok(checkCompatibility(build, supply(500)).issues.some(issue => issue.code === 'psu-headroom' && issue.severity === 'warning'))
})

test('storage interface and length mismatches are checked independently', () => {
  const wrongDrive = { ...storage, specs: { ...storage.specs, storageInterface: 'M.2 SATA' as const, storageLengthMm: 110 } }
  assert.deepEqual(checkCompatibility(build, replaced(wrongDrive)).issues.map(issue => issue.code), ['storage-interface', 'storage-length'])
})

test('missing and invalid build references produce different severities', () => {
  assert.equal(checkCompatibility({}, catalog).status, 'warning')
  const incorrect = checkCompatibility({ gpu: 'ram' }, catalog)
  assert.equal(incorrect.status, 'incompatible')
  assert.ok(incorrect.issues.some(issue => issue.code === 'unknown-part'))
})

test('alternatives leave the current selection unchanged and exclude unrelated or inconsistent items', () => {
  const valid = { ...gpu, id: 'valid', price: 120 }
  const tooLong = { ...gpu, id: 'too-long', dimensions: { width: 301, height: 135, depth: 52 } }
  const unavailable = { ...gpu, id: 'unavailable', inStock: false }
  const original = { ...build }
  assert.deepEqual(findCompatibleAlternatives(build, [...catalog, valid, tooLong, unavailable], 'gpu').map(entry => entry.id), ['valid'])
  assert.deepEqual(build, original)
})

test('performance analysis carries source, settings and exact FPS values, filtered by chip and VRAM', () => {
  const analysis = analyzeBuild(build, catalog)
  assert.equal(analysis.benchmarks.length, 9)
  const result = analysis.benchmarks.find(reading => reading.game.startsWith('Cyberpunk') && reading.resolution === '1440p')
  assert.equal(result?.averageFps, 75)
  assert.match(result?.testSystem ?? '', /7800X3D/)
  assert.match(result?.source ?? '', /^https:\/\/www\.techspot\.com\//)
  assert.equal(analysis.budget.total, 9000)
  assert.equal(analysis.budget.items.reduce((total, item) => total + item.price, 0), analysis.budget.total)
  assert.equal(analysis.budget.demo, true)
  assert.equal(analysis.workloads.find(item => item.id === 'streaming')?.assessment, 'Указан аппаратный кодировщик')
  const unknownMemory = analyzeBuild(build, replaced({ ...gpu, specs: { ...gpu.specs, vramGb: 4 } }))
  assert.deepEqual(unknownMemory.benchmarks, [])
  assert.equal(unknownMemory.power.estimatedWatts, analysis.power.estimatedWatts)
})

test('published catalogue presets have no confirmed conflict and expose benchmark coverage by GPU', () => {
  const check = createCompatibilityChecker(productCatalog)
  const populated = presets.filter(entry => entry.build.cpu)
  assert.ok(populated.length >= 5)
  for (const preset of populated) {
    const report = check(preset.build, { fanLocation: 'rear' })
    assert.notEqual(report.status, 'incompatible', preset.name)
    assert.equal(report.issues.filter(issue => issue.severity === 'incompatible').length, 0, preset.name)
    assert.ok(analyzeBuild(preset.build, productCatalog).benchmarks.length >= 6, preset.name)
  }
  const gamingPreset = presets.find(preset => preset.id === 'cyberpunk')
  assert.ok(gamingPreset)
  assert.equal(analyzeBuild(gamingPreset.build, productCatalog).benchmarks.find(
    sample => sample.game.startsWith('Cyberpunk') && sample.resolution === '1440p',
  )?.averageFps, 107)
})
