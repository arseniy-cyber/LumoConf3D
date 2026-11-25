import { categories, type Build, type Category, type FanMount, type MountLocation, type Part } from './types.ts'

export type CompatibilityStatus = 'incompatible' | 'warning' | 'compatible'

export interface CompatibilityIssue {
  code: string
  severity: CompatibilityStatus
  categories: Category[]
  message: string
}

export interface CompatibilityOptions {
  fanLocation?: MountLocation
  radiatorLocation?: MountLocation
}

export interface CompatibilityReport {
  status: CompatibilityStatus
  issues: CompatibilityIssue[]
  checked: CompatibilityIssue[]
  estimatedWatts: number | null
  recommendedPsuWatts: number | null
}

export interface PowerEstimate {
  estimatedWatts: number | null
  recommendedPsuWatts: number | null
  selectedPsuWatts: number | null
  notes: string[]
}

type Parts = Partial<Record<Category, Part>>
type RecordCheck = (code: string, affected: Category[], fits: boolean | undefined, messages: [failure: string, success: string, unknown: string]) => void

const coreCategories: Category[] = ['case', 'cpu', 'motherboard', 'ram', 'cooler', 'psu', 'storage']
const fanLocations: Record<MountLocation, string> = {
  front: 'спереди', top: 'сверху', rear: 'сзади', bottom: 'снизу', side: 'сбоку',
}
const accessoryAllowance = 60
const psuSizes = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200, 1300, 1500, 1600, 2000]

export function resolveParts(build: Build, catalog: readonly Part[]): Parts {
  return resolveIndexedParts(build, new Map(catalog.map((part) => [part.id, part])))
}

function resolveIndexedParts(build: Build, index: ReadonlyMap<string, Part>): Parts {
  const parts: Parts = {}
  for (const category of categories) {
    const id = build[category]
    if (!id) continue
    const part = index.get(id)
    if (part?.category === category) parts[category] = part
  }
  return parts
}

function atMost(value: number | undefined, limit: number | undefined): boolean | undefined {
  return value === undefined || limit === undefined ? undefined : value <= limit
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function matches<T>(value: T | undefined, accepted: readonly T[] | undefined): boolean | undefined {
  return value === undefined || accepted === undefined ? undefined : accepted.includes(value)
}

function same<T>(first: T | undefined, second: T | undefined): boolean | undefined {
  return first === undefined || second === undefined ? undefined : first === second
}

function estimatePower(parts: Parts): PowerEstimate {
  const { cpu, gpu, psu } = parts
  const notes = ['Расчёт опирается на опубликованные мощности комплектующих и расчётный резерв для платы, памяти, накопителей и вентиляторов.']
  const selectedPsuWatts = getNumber(psu?.specs.psuWatts) ?? null
  const manufacturerMinimum = getNumber(gpu?.specs.recommendedPsuWatts)
  const cpuMaximum = getNumber(cpu?.specs.maxPowerW)
  const cpuNominal = getNumber(cpu?.specs.wattage)
  const cpuPower = cpuMaximum ?? cpuNominal
  const gpuPower = gpu ? getNumber(gpu.specs.wattage) : 0
  if (cpuPower === undefined || gpuPower === undefined) {
    return {
      estimatedWatts: null,
      recommendedPsuWatts: manufacturerMinimum ?? null,
      selectedPsuWatts,
      notes: ['Для расчёта нужны опубликованные мощности выбранных процессора и видеокарты.'],
    }
  }
  if (!cpuMaximum) notes.push('Для процессора использовано опубликованное номинальное значение. Потребление в режиме ускорения может быть выше.')
  const additionalPower = (['motherboard', 'ram', 'cooler', 'storage', 'fan'] as const)
    .reduce((sum, category) => sum + (getNumber(parts[category]?.specs.wattage) ?? 0), 0)
  const estimatedWatts = Math.ceil((cpuPower + gpuPower + Math.max(accessoryAllowance, additionalPower)) / 10) * 10
  const target = Math.max(estimatedWatts / .8, manufacturerMinimum ?? 0)
  const recommendedPsuWatts = psuSizes.find((size) => size >= target) ?? Math.ceil(target / 100) * 100
  return { estimatedWatts, recommendedPsuWatts, selectedPsuWatts, notes }
}

export function estimateBuildPower(build: Build, catalog: readonly Part[]): PowerEstimate {
  return estimatePower(resolveParts(build, catalog))
}

function compareBios(installed: string, required: string): boolean | undefined {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/^v\s*/, '')
  const have = normalize(installed)
  const need = normalize(required)
  if (have === need) return true
  if (/^\d+(\.\d+)*$/.test(have) && /^\d+(\.\d+)*$/.test(need)) {
    const actual = have.split('.').map(Number)
    const minimum = need.split('.').map(Number)
    for (let index = 0; index < Math.max(actual.length, minimum.length); index++) {
      const difference = (actual[index] ?? 0) - (minimum[index] ?? 0)
      if (difference !== 0) return difference > 0
    }
    return true
  }
  // MSI publishes board-prefixed alphanumeric revisions such as 7D75v1G.
  const msiVersion = (value: string) => /^([\da-z]+)v([\da-z]{2})$/.exec(value)
  const actualMsi = msiVersion(have)
  const minimumMsi = msiVersion(need)
  if (actualMsi?.[1] && actualMsi[1] === minimumMsi?.[1]) {
    return parseInt(actualMsi[2], 36) >= parseInt(minimumMsi[2], 36)
  }
  return undefined
}

function connectorKey(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (/12vhpwr|12v2x6|16pin/.test(key)) return 'GPU 16-pin'
  if (/^(pcie|pci)?(62|8)(pin)?(pcie|pci)?$/.test(key)) return 'PCIe 8-pin'
  if (/^(pcie|pci)?6(pin)?(pcie|pci)?$/.test(key)) return 'PCIe 6-pin'
  if (/eps|cpu/.test(key) && /8|44/.test(key)) return 'EPS 8-pin'
  if (/eps|cpu/.test(key) && /4/.test(key)) return 'EPS 4-pin'
  if (/atx|24pin/.test(key) && /24|204/.test(key)) return 'ATX 24-pin'
  if (/^sata/.test(key)) return 'SATA'
  return value.trim().toUpperCase()
}

function connectorCounts(connectors: Record<string, number> | undefined): Map<string, number> | undefined {
  if (!connectors) return undefined
  const normalized = new Map<string, number>()
  for (const [connector, count] of Object.entries(connectors)) {
    if (!Number.isSafeInteger(count) || count < 0) continue
    const key = connectorKey(connector)
    normalized.set(key, Math.max(normalized.get(key) ?? 0, count))
  }
  return normalized
}

function checkConnectors(psu: Part, device: Part, required: Record<string, number> | undefined, check: RecordCheck) {
  const needed = connectorCounts(required)
  const available = connectorCounts(psu.specs.connectors ?? psu.specs.powerConnectors)
  const used = new Map<string, number>()
  let fits: boolean | undefined
  if (needed && available) {
    fits = true
    for (const [key, count] of needed) {
      const direct = Math.min(count, available.get(key) ?? 0)
      used.set(key, direct)
      if (direct === count) continue
      if (key === 'PCIe 6-pin' || key === 'EPS 4-pin') continue
      if (key === 'GPU 16-pin' && getNumber(device.specs.adapterPcie8PinCount)) continue
      fits = false
    }
    const adapter = getNumber(device.specs.adapterPcie8PinCount)
    if (adapter !== undefined) {
      const missing16Pin = (needed.get('GPU 16-pin') ?? 0) - (used.get('GPU 16-pin') ?? 0)
      const remainingPcie8 = (available.get('PCIe 8-pin') ?? 0) - (used.get('PCIe 8-pin') ?? 0)
      fits &&= missing16Pin * adapter <= remainingPcie8
      used.set('PCIe 8-pin', (used.get('PCIe 8-pin') ?? 0) + missing16Pin * adapter)
    }
    for (const [small, large] of [['PCIe 6-pin', 'PCIe 8-pin'], ['EPS 4-pin', 'EPS 8-pin']]) {
      const missingSmall = (needed.get(small) ?? 0) - (used.get(small) ?? 0)
      const remainingLarge = (available.get(large) ?? 0) - (used.get(large) ?? 0)
      // Fixed eight-pin sockets are not assumed to be detachable.
      if (missingSmall > 0) {
        fits &&= (getNumber(psu.specs[large === 'PCIe 8-pin' ? 'detachablePcie8PinCount' : 'detachableEps8PinCount']) ?? 0) >= missingSmall
          && remainingLarge >= missingSmall
      }
    }
  }
  check(`${device.category}-power-connectors`, ['psu', device.category], fits, [
    `У блока питания недостаточно подходящих разъёмов для «${device.name}».`,
    `Разъёмы питания для «${device.name}» доступны.`,
    `Нет полных данных для проверки разъёмов питания «${device.name}».`,
  ])
}

function radiatorFanSize(size: number): 120 | 140 {
  return size === 140 || size === 280 || size === 420 || size === 560 ? 140 : 120
}

function freeFanSlots(mount: FanMount, radiatorSize: number): number {
  const fanSize = radiatorFanSize(radiatorSize)
  return Math.max(0, mountFanQuantity(mount, fanSize) - Math.ceil(radiatorSize / fanSize))
}

function mountFanQuantity(mount: FanMount, fanSize: number): number {
  const sizeLimits = (mount as FanMount & { fanSizeLimits?: Record<number, number> }).fanSizeLimits
  const sizeLimit = sizeLimits?.[fanSize]
  return sizeLimit === undefined ? mount.quantity : Math.min(mount.quantity, sizeLimit)
}

function countFanSlots(mounts: readonly FanMount[], fanSize: number, radiator?: { location: MountLocation; size: number }): number {
  return mounts.reduce((count, mount) => {
    if (mount.location !== radiator?.location) return count + mountFanQuantity(mount, fanSize)
    return count + (fanSize === radiatorFanSize(radiator.size) ? freeFanSlots(mount, radiator.size) : 0)
  }, 0)
}

function radiatorThicknessLimit(enclosure: Part, mount: FanMount, radiatorSize: number): number | undefined {
  const clearances = enclosure.specs.radiatorStackClearanceMm
  const locationLimits = typeof clearances === 'object' && clearances !== null ? clearances as Partial<Record<MountLocation, number>> : {}
  const specifiedLimit = getNumber(locationLimits[mount.location])
  if (specifiedLimit !== undefined || mount.location !== 'top') return specifiedLimit
  return getNumber(enclosure.specs.topRadiatorFanStackLimitMm)
    ?? (radiatorFanSize(radiatorSize) === 140 ? getNumber(enclosure.specs.top140RadiatorFanStackLimitMm) : undefined)
}

function radiatorWithFans(cooler: Part): number | undefined {
  const radiatorThickness = cooler.specs.radiatorThicknessMm
  const fanThickness = getNumber(cooler.specs.fanThicknessMm ?? cooler.specs.radiatorFanThicknessMm)
  return radiatorThickness === undefined || fanThickness === undefined ? undefined : radiatorThickness + fanThickness
}

function gpuClearanceWithRadiator(enclosure: Part, radiatorSize: number): number | undefined {
  return getNumber(enclosure.specs.gpuClearanceWithFrontRadiatorMm)
    ?? (radiatorSize === 360 ? getNumber(enclosure.specs.front360GpuClearanceMm) : undefined)
}

function radiatorChecks(enclosure: Part, mount: FanMount, cooler: Part, size: number, ram?: Part, gpu?: Part) {
  const requireLowProfileRam = mount.location === 'top' && size === 280 && enclosure.specs.top280RequiresLowProfileRam === true
  const frontWithGpu = mount.location === 'front' && gpu !== undefined
  return {
    stack: atMost(radiatorWithFans(cooler), radiatorThicknessLimit(enclosure, mount, size)),
    ram: requireLowProfileRam && ram ? same(ram.specs.lowProfile, true) : true,
    gpu: frontWithGpu ? atMost(gpu.dimensions?.width, gpuClearanceWithRadiator(enclosure, size)) : true,
  }
}

const radiatorPriority: MountLocation[] = ['top', 'front', 'side', 'bottom', 'rear']

export function resolveRadiatorLocation(
  enclosure?: Part, cooler?: Part, ram?: Part, gpu?: Part, selection?: { fan?: Part; fanLocation?: MountLocation },
): MountLocation | undefined {
  const size = cooler?.specs.radiatorMm
  if (!enclosure || !cooler || size === undefined) return undefined
  const mounts = enclosure.specs.fanMounts ?? []
  const fanSize = selection?.fan?.specs.fanSizeMm
  const fanCount = selection?.fan?.specs.fanCount ?? 1
  const fanMounts = mounts.filter((mount) => (
    (!selection?.fanLocation || mount.location === selection.fanLocation) && fanSize !== undefined && mount.fanSizes.includes(fanSize)
  ))
  return mounts
    .filter((mount) => mount.radiatorSizes?.includes(size))
    .map((mount) => ({
      location: mount.location,
      checks: [
        ...Object.values(radiatorChecks(enclosure, mount, cooler, size, ram, gpu)),
        fanSize === undefined ? true : countFanSlots(fanMounts, fanSize, { location: mount.location, size }) >= fanCount,
      ],
    }))
    .filter(({ checks }) => checks.every((value) => value !== false))
    .sort((first, second) => (
      first.checks.filter((entry) => entry === undefined).length - second.checks.filter((entry) => entry === undefined).length
      || radiatorPriority.indexOf(first.location) - radiatorPriority.indexOf(second.location)
    ))[0]?.location
}

export function checkCompatibility(build: Build, catalog: readonly Part[], options: CompatibilityOptions = {}): CompatibilityReport {
  return checkResolvedCompatibility(build, resolveParts(build, catalog), options)
}

export function createCompatibilityChecker(catalog: readonly Part[]) {
  const index = new Map(catalog.map((part) => [part.id, part]))
  return (build: Build, options: CompatibilityOptions = {}): CompatibilityReport => (
    checkResolvedCompatibility(build, resolveIndexedParts(build, index), options)
  )
}

function checkResolvedCompatibility(build: Build, parts: Parts, options: CompatibilityOptions): CompatibilityReport {
  const { case: enclosure, cpu, motherboard, ram, gpu, cooler, psu, storage, fan } = parts
  const issues: CompatibilityIssue[] = []
  const checked: CompatibilityIssue[] = []
  const record = (code: string, severity: CompatibilityStatus, affected: Category[], message: string) => {
    const destination = severity === 'compatible' ? checked : issues
    destination.push({ code, severity, categories: affected, message })
  }
  const check: RecordCheck = (code, affected, fits, [failure, success, unknown]) => {
    if (fits === undefined) record(code, 'warning', affected, unknown)
    else record(code, fits ? 'compatible' : 'incompatible', affected, fits ? success : failure)
  }

  for (const category of categories) {
    if (build[category] && !parts[category]) {
      record('unknown-part', 'incompatible', [category], 'Выбранная позиция отсутствует в каталоге или принадлежит другой категории.')
    }
  }
  const missing = coreCategories.filter((category) => !build[category])
  if (missing.length) record('incomplete-build', 'warning', missing, 'Сборка пока не укомплектована. Добавьте основные детали для полной проверки.')
  if (!gpu && cpu && (cpu.specs.hasIntegratedGraphics ?? cpu.specs.integratedGraphics) !== true) {
    record('display-output', 'warning', ['cpu', 'gpu'], 'Видеокарта не выбрана. Проверьте, есть ли у процессора встроенная графика.')
  }

  if (cpu && motherboard) {
    const socket = same(cpu.specs.socket, motherboard.specs.socket)
    check('cpu-socket', ['cpu', 'motherboard'], socket, [
      `Сокет процессора ${cpu.specs.socket} несовместим с сокетом платы ${motherboard.specs.socket}.`,
      `Сокет ${cpu.specs.socket} совпадает у платы и процессора.`,
      'Не указан сокет процессора или материнской платы.',
    ])
    if (socket !== false) {
      const requiredBios = motherboard.specs.biosRequired?.[cpu.id] ?? motherboard.specs.biosRequired?.[cpu.model]
      const explicitSupport = Boolean(requiredBios) || (Array.isArray(motherboard.specs.cpuModels) && motherboard.specs.cpuModels.includes(cpu.model))
      const familySupport = matches(cpu.specs.family, motherboard.specs.cpuFamilies)
      check('cpu-family', ['cpu', 'motherboard'], explicitSupport || familySupport, [
        `Семейство процессоров ${cpu.specs.family} отсутствует в списке поддержки платы.`,
        explicitSupport ? 'Процессор указан в списке поддержки платы.' : `Плата поддерживает семейство ${cpu.specs.family}.`,
        'Совпадения сокета недостаточно для подтверждения поддержки модели процессора.',
      ])
      if (requiredBios) {
        const installed = motherboard.specs.bios
        check('bios-version', ['cpu', 'motherboard'], installed ? compareBios(installed, requiredBios) : undefined, [
          `Для выбранного процессора требуется BIOS ${requiredBios} или новее. Настроенная версия ${installed} устарела.`,
          `Указанная версия BIOS соответствует минимальной версии ${requiredBios}.`,
          `Для процессора нужен BIOS ${requiredBios} или новее. Проверьте прошивку экземпляра платы.`,
        ])
      } else if (familySupport !== false && motherboard.specs.biosVerifiedAllCpu !== true) {
        record('bios-unknown', 'warning', ['cpu', 'motherboard'], 'Версия BIOS для выбранного процессора не подтверждена. Сверьте её с таблицей совместимости производителя.')
      }
    }
  }
  if (motherboard && ram) {
    check('ram-type', ['motherboard', 'ram'], same(ram.specs.memoryType, motherboard.specs.memoryType), [
      `Модули ${ram.specs.memoryType} не подходят для слотов ${motherboard.specs.memoryType}.`,
      `Плата поддерживает память ${ram.specs.memoryType}.`,
      'Тип памяти не указан в характеристиках платы или комплекта.',
    ])
    check('ram-slots', ['motherboard', 'ram'], atMost(ram.specs.memoryModules, motherboard.specs.memorySlots), [
      `В комплекте ${ram.specs.memoryModules} модулей, на плате ${motherboard.specs.memorySlots} слотов.`,
      'На материнской плате достаточно слотов для комплекта памяти.',
      'Не подтверждено количество модулей или свободных слотов памяти.',
    ])
    if (cpu && (cpu.specs.memoryType || Array.isArray(cpu.specs.memoryTypes))) {
      const supportedTypes = cpu.specs.memoryType ? [cpu.specs.memoryType] : cpu.specs.memoryTypes as string[]
      check('cpu-ram-type', ['cpu', 'ram'], matches(ram.specs.memoryType, supportedTypes), [
        `Контроллер процессора не поддерживает ${ram.specs.memoryType}.`,
        `Контроллер процессора поддерживает ${ram.specs.memoryType}.`,
        'Тип памяти не указан.',
      ])
    }
    const maxRam = getNumber(motherboard.specs.maxMemoryGb)
    if (maxRam !== undefined) {
      check('ram-capacity', ['motherboard', 'ram'], atMost(ram.specs.capacityGb, maxRam), [
        `Плата поддерживает до ${maxRam} ГБ оперативной памяти.`,
        'Объём комплекта памяти входит в пределы платы.',
        'Объём комплекта памяти не указан.',
      ])
    }
    const cpuRatedRam = getNumber(cpu?.specs.memoryRatedMts)
    if (cpuRatedRam !== undefined && ram.specs.speedMts !== undefined && ram.specs.speedMts > cpuRatedRam) {
      record('ram-profile', 'warning', ['cpu', 'motherboard', 'ram'], 'Заявленная скорость памяти выше штатного режима контроллера CPU. Проверьте профиль XMP или EXPO.')
    }
  }
  if (enclosure && motherboard) {
    check('board-format', ['case', 'motherboard'], matches(motherboard.specs.formFactor, enclosure.specs.formFactors), [
      `В корпусе нет креплений под плату формата ${motherboard.specs.formFactor}.`,
      `Корпус поддерживает формат ${motherboard.specs.formFactor}.`,
      'Не указан форм-фактор платы или список креплений корпуса.',
    ])
    const maxBoardWidth = getNumber(enclosure.specs.eAtxWidthLimitMm ?? enclosure.specs.boardWidthClearanceMm)
    if (motherboard.specs.formFactor === 'E-ATX' && maxBoardWidth !== undefined) {
      check('board-width', ['case', 'motherboard'], atMost(motherboard.dimensions?.width ?? getNumber(motherboard.specs.widthMm), maxBoardWidth), [
        `Ширина платы E-ATX превышает лимит корпуса ${maxBoardWidth} мм.`,
        'Ширина платы E-ATX входит в допуск корпуса.',
        'Физическая ширина платы E-ATX не указана.',
      ])
    }
  }
  if (gpu && enclosure) {
    const gpuLength = gpu.dimensions?.width
    const maxLength = enclosure.specs.gpuClearanceMm
    check('gpu-length', ['case', 'gpu'], atMost(gpuLength, maxLength), [
      `Длина видеокарты ${gpuLength} мм превышает допустимые ${maxLength} мм.`,
      `Видеокарта длиной ${gpuLength} мм помещается в лимит корпуса ${maxLength} мм.`,
      'Не указана длина видеокарты или максимальная длина для корпуса.',
    ])
    const cardHeight = gpu.dimensions?.height
    const availableHeight = enclosure.specs.gpuHeightClearanceMm
    check('gpu-height', ['case', 'gpu'], atMost(cardHeight, availableHeight), [
      `Высота видеокарты ${cardHeight} мм превышает доступные ${availableHeight} мм.`,
      'Высота видеокарты входит в допуск корпуса.',
      'Максимальная высота видеокарты с учётом боковой панели не подтверждена.',
    ])
    check('gpu-slots', ['case', 'gpu'], atMost(gpu.specs.gpuSlots, enclosure.specs.gpuSlotClearance), [
      `Видеокарта занимает ${gpu.specs.gpuSlots} слота. В корпусе доступно ${enclosure.specs.gpuSlotClearance}.`,
      'Корпус имеет нужное количество слотов расширения.',
      'Не указана толщина видеокарты в слотах или доступное количество слотов корпуса.',
    ])
    const maxThickness = getNumber(enclosure.specs.gpuThicknessClearanceMm)
    if (maxThickness !== undefined) {
      check('gpu-thickness', ['case', 'gpu'], atMost(gpu.dimensions?.depth, maxThickness), [
        `Толщина видеокарты превышает допустимые ${maxThickness} мм.`,
        'Толщина видеокарты входит в допуск корпуса.',
        'Физическая толщина видеокарты не указана.',
      ])
    }
    if ((connectorCounts(gpu.specs.powerConnectors ?? gpu.specs.connectors)?.get('GPU 16-pin') ?? 0) > 0) {
      const requiredCable = getNumber(gpu.specs.cableClearanceMm ?? gpu.specs.cableBendClearanceMm)
      const availableCable = getNumber(enclosure.specs.gpuCableClearanceMm)
      check('gpu-cable-clearance', ['case', 'gpu'], atMost(requiredCable, availableCable), [
        'До боковой панели недостаточно места для безопасного изгиба кабеля питания GPU.',
        'Подтверждён запас для изгиба кабеля питания GPU.',
        'Проверьте зазор для кабеля 16-pin между разъёмом видеокарты и боковой панелью.',
      ])
    }
  }
  if (cpu && cooler) {
    check('cooler-socket', ['cpu', 'cooler'], matches(cpu.specs.socket, cooler.specs.sockets), [
      `У охлаждения нет крепления для сокета ${cpu.specs.socket}.`,
      `Кулер крепится на сокет ${cpu.specs.socket}.`,
      'Не подтверждены крепления кулера для сокета процессора.',
    ])
  }
  if (enclosure && cooler && !cooler.specs.radiatorMm) {
    const height = cooler.specs.coolerHeightMm
    const maxHeight = enclosure.specs.coolerClearanceMm
    check('cooler-height', ['case', 'cooler'], atMost(height, maxHeight), [
      `Высота кулера ${height} мм превышает допустимые ${maxHeight} мм.`,
      `Кулер высотой ${height} мм входит в допуск корпуса ${maxHeight} мм.`,
      'Не указана высота кулера или высота крепления в корпусе.',
    ])
  }
  if (ram && cooler && !cooler.specs.radiatorMm) {
    const ramClearance = getNumber(cooler.specs.ramClearanceMm)
    if (ramClearance !== undefined) {
      const ramHeight = getNumber(ram.specs.moduleHeightMm) ?? ram.dimensions?.height
      const raisedFanHeight = getNumber(cooler.specs.raisedFanClearanceMm)
      const caseClearance = enclosure?.specs.coolerClearanceMm
      const coolerHeight = cooler.specs.coolerHeightMm
      let fits = atMost(ramHeight, ramClearance)
      if (fits === false && ramHeight !== undefined && (raisedFanHeight !== undefined || cooler.specs.fanHeightAdjustable === true)) {
        const fittedWhenRaised = atMost(coolerHeight === undefined ? undefined : coolerHeight + ramHeight - ramClearance, caseClearance)
        if (raisedFanHeight === undefined) {
          fits = fittedWhenRaised === false ? false : undefined
        } else {
          fits = ramHeight <= raisedFanHeight && fittedWhenRaised
        }
      }
      check('cooler-ram', ['case', 'cooler', 'ram'], fits, [
        'Высокие модули памяти упираются в кулер или поднятый вентилятор не помещается в корпус.',
        'Модули памяти помещаются под кулером.',
        'Не подтверждён зазор между модулями памяти, кулером и боковой панелью корпуса.',
      ])
    } else {
      record('cooler-ram-unknown', 'warning', ['cooler', 'ram'], 'Проверьте зазор над модулями памяти при установке башенного кулера.')
    }
  }

  const mounts = enclosure?.specs.fanMounts
  const radiatorSize = cooler?.specs.radiatorMm
  let radiatorMounts: FanMount[] = []
  if (enclosure && cooler && radiatorSize !== undefined) {
    const positions = mounts?.filter((mount) => !options.radiatorLocation || mount.location === options.radiatorLocation)
    radiatorMounts = positions?.filter((mount) => mount.radiatorSizes?.includes(radiatorSize)) ?? []
    const haveRadiatorData = positions?.every((mount) => mount.radiatorSizes !== undefined)
    check('radiator-mount', ['case', 'cooler'], radiatorMounts.length > 0 || (haveRadiatorData ? false : undefined), [
      `Для радиатора ${radiatorSize} мм нет подходящего крепления${options.radiatorLocation ? ` ${fanLocations[options.radiatorLocation]}` : ''}.`,
      `Радиатор ${radiatorSize} мм можно установить ${radiatorMounts.map((mount) => fanLocations[mount.location]).join(' или ')}.`,
      'Данные о поддерживаемых размерах радиатора отсутствуют.',
    ])
    if (radiatorMounts.length) {
      const positionChecks = radiatorMounts.map((mount) => radiatorChecks(enclosure, mount, cooler, radiatorSize, ram, gpu))
      const fitChecks = positionChecks.map(({ stack }) => stack)
      const fits = fitChecks.some((fit) => fit === true) ? true : fitChecks.every((fit) => fit === false) ? false : undefined
      check('radiator-thickness', ['case', 'cooler'], fits, [
        'Толщина радиатора вместе с вентиляторами превышает лимит доступных креплений.',
        'Толщина радиатора вместе с вентиляторами входит в допуск корпуса минимум на одном креплении.',
        'Допустимая толщина радиатора с вентиляторами или зазор до материнской платы не подтверждены.',
      ])
      if (ram && radiatorSize === 280 && enclosure.specs.top280RequiresLowProfileRam === true &&
          radiatorMounts.some((mount) => mount.location === 'top') && ram.specs.lowProfile !== true) {
        const hasOtherMount = radiatorMounts.some((mount) => mount.location !== 'top')
        const knownHighProfile = ram.specs.lowProfile === false
        record('radiator-ram', knownHighProfile && !hasOtherMount ? 'incompatible' : 'warning', ['case', 'cooler', 'ram'],
          'Для верхнего радиатора 280 мм производитель корпуса требует низкопрофильную оперативную память.')
      }
      if (gpu && radiatorMounts.every((mount) => mount.location === 'front')) {
        check('gpu-front-radiator', ['case', 'gpu', 'cooler'], positionChecks[0].gpu, [
          'Передний радиатор и видеокарта не помещаются в корпус одновременно.',
          'Видеокарта помещается вместе с передним радиатором по указанному пределу.',
          'Проверьте длину видеокарты после установки переднего радиатора.',
        ])
      }
      const usableMounts = radiatorMounts.filter((_, index) => Object.values(positionChecks[index]).every((value) => value !== false))
      if (!usableMounts.length && radiatorMounts.length > 1) {
        record('radiator-layout', 'incompatible', ['case', 'cooler', 'gpu', 'ram'], 'Ни одно крепление радиатора не подходит с учётом толщины, видеокарты и оперативной памяти.')
      }
      if (usableMounts.length) radiatorMounts = usableMounts
    }
  }
  if (enclosure && fan) {
    const fanSize = fan.specs.fanSizeMm
    const count = fan.specs.fanCount ?? 1
    const availableMounts = mounts?.filter((mount) => (
      (!options.fanLocation || mount.location === options.fanLocation) && fanSize !== undefined && mount.fanSizes.includes(fanSize)
    ))
    const capacity = fanSize === undefined || availableMounts === undefined ? undefined : countFanSlots(availableMounts, fanSize)
    check('fan-mount', ['case', 'fan'], fanSize === undefined ? undefined : atMost(count, capacity), [
      `Нет ${count} креплений для вентиляторов ${fanSize} мм${options.fanLocation ? ` ${fanLocations[options.fanLocation]}` : ''}.`,
      `Доступно подходящее крепление для вентиляторов ${fanSize} мм.`,
      'Не указан размер вентиляторов или список креплений корпуса.',
    ])
    if (availableMounts && fanSize !== undefined && radiatorSize !== undefined && radiatorMounts.length && capacity !== undefined && capacity >= count) {
      const fit = radiatorMounts.some((radiator) => (
        countFanSlots(availableMounts, fanSize, { location: radiator.location, size: radiatorSize }) >= count
      ))
      check('fan-radiator-conflict', ['case', 'cooler', 'fan'], fit, [
        'Радиатор и дополнительные вентиляторы занимают одни и те же крепления.',
        'Для радиатора и дополнительных вентиляторов хватает креплений.',
        'Совместное размещение радиатора и вентиляторов не подтверждено.',
      ])
    }
  }
  if (enclosure && psu) {
    check('psu-format', ['case', 'psu'], matches(psu.specs.psuFormFactor, enclosure.specs.psuFormFactors), [
      `Корпус не поддерживает блок питания формата ${psu.specs.psuFormFactor}.`,
      `Корпус поддерживает блок питания формата ${psu.specs.psuFormFactor}.`,
      'Формат блока питания или крепление в корпусе не подтверждены.',
    ])
    check('psu-length', ['case', 'psu'], atMost(psu.specs.psuLengthMm ?? psu.dimensions?.depth, enclosure.specs.psuClearanceMm), [
      `Длина блока питания превышает лимит корпуса ${enclosure.specs.psuClearanceMm} мм.`,
      'Длина блока питания входит в допуск корпуса.',
      'Не подтверждена доступная длина для блока питания.',
    ])
    const twoTrayLimit = getNumber(enclosure.specs.psuClearanceWithTwoDriveTraysMm)
    if (atMost(psu.specs.psuLengthMm ?? psu.dimensions?.depth, twoTrayLimit) === false) {
      record('psu-drive-tray', 'warning', ['case', 'psu', 'storage'], `При двух корзинах накопителей корпус ограничивает длину блока питания до ${twoTrayLimit} мм.`)
    }
    const cableRoom = getNumber(enclosure.specs.psuCableClearanceMm)
    const cableDepth = getNumber(psu.specs.cableBendClearanceMm)
    if (cableRoom !== undefined || cableDepth !== undefined) {
      check('psu-cable-clearance', ['case', 'psu'], atMost(cableDepth, cableRoom), [
        'Недостаточно пространства для кабелей блока питания.',
        'Для подключения кабелей блока питания есть заявленный зазор.',
        'Пространство для подключения кабелей блока питания не подтверждено.',
      ])
    }
  }
  if (storage && motherboard) {
    const storageInterface = storage.specs.storageInterface
    const ports = storageInterface === undefined ? undefined : motherboard.specs.storagePorts?.[storageInterface]
    check('storage-interface', ['motherboard', 'storage'], atMost(1, ports), [
      `На материнской плате нет свободных разъёмов ${storageInterface}.`,
      `Плата имеет разъём ${storageInterface} для накопителя.`,
      'Поддержка интерфейса накопителя материнской платой не подтверждена.',
    ])
    if (storageInterface?.startsWith('M.2')) {
      check('storage-length', ['motherboard', 'storage'], matches(storage.specs.storageLengthMm, motherboard.specs.m2LengthsMm), [
        `На плате нет крепления под накопитель M.2 длиной ${storage.specs.storageLengthMm} мм.`,
        `Длина накопителя M.2 ${storage.specs.storageLengthMm} мм поддерживается.`,
        'Длина накопителя M.2 или список точек крепления не подтверждены.',
      ])
    }
  }
  if (storage?.specs.storageInterface === 'SATA' && enclosure) {
    check('sata-drive-mount', ['case', 'storage'], atMost(1, enclosure.specs.storageMounts), [
      'В корпусе нет крепления для накопителя SATA.',
      'В корпусе есть крепление для накопителя SATA.',
      'Крепление для накопителя SATA не подтверждено.',
    ])
  }
  if (psu && gpu) checkConnectors(psu, gpu, gpu.specs.powerConnectors ?? gpu.specs.connectors, check)
  if (psu && motherboard) checkConnectors(psu, motherboard, motherboard.specs.powerConnectors, check)
  if (psu && storage?.specs.storageInterface === 'SATA') checkConnectors(psu, storage, { SATA: 1 }, check)

  const { estimatedWatts, recommendedPsuWatts, selectedPsuWatts } = estimatePower(parts)
  if (psu && (cpu || gpu)) {
    const gpuPower = getNumber(gpu?.specs.wattage)
    const cpuPower = getNumber(cpu?.specs.maxPowerW)
    const publishedComponentPower = (gpuPower ?? 0) + (cpuPower ?? 0)
    if (selectedPsuWatts !== null && selectedPsuWatts < publishedComponentPower) {
      record('psu-insufficient', 'incompatible', ['cpu', 'gpu', 'psu'], `Блок питания ${selectedPsuWatts} Вт слабее суммарной опубликованной максимальной мощности основных компонентов ${publishedComponentPower} Вт.`)
    } else if (selectedPsuWatts === null || recommendedPsuWatts === null) {
      record('psu-power-unknown', 'warning', ['cpu', 'gpu', 'psu'], 'Недостаточно данных для проверки запаса мощности блока питания.')
    } else if (selectedPsuWatts < recommendedPsuWatts) {
      record('psu-headroom', 'warning', ['cpu', 'gpu', 'psu'], `Блок питания ${selectedPsuWatts} Вт ниже рекомендуемого запаса ${recommendedPsuWatts} Вт.`)
    } else {
      record('psu-headroom', 'compatible', ['cpu', 'gpu', 'psu'], `Блок питания соответствует расчётной рекомендации ${recommendedPsuWatts} Вт.`)
    }
  }

  const status = issues.some((issue) => issue.severity === 'incompatible') ? 'incompatible' : issues.length ? 'warning' : 'compatible'
  return { status, issues, checked, estimatedWatts, recommendedPsuWatts }
}

export function findCompatibleAlternatives(
  build: Build,
  catalog: readonly Part[],
  category: Category,
  options: CompatibilityOptions = {},
): Part[] {
  const checkCandidate = createCompatibilityChecker(catalog)
  return catalog
    .filter((part) => part.category === category && part.inStock && part.id !== build[category])
    .map((part) => ({
      part,
      issues: checkCandidate({ ...build, [category]: part.id }, options).issues.filter((issue) => issue.categories.includes(category)),
    }))
    .filter(({ issues }) => issues.every(({ severity }) => severity !== 'incompatible'))
    .sort((first, second) => first.issues.length - second.issues.length || first.part.price - second.part.price)
    .map(({ part }) => part)
}
