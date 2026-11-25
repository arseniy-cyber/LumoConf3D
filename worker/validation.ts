import { categories, type Build, type Part, type Preset, type Specs } from '../src/shared/types'
import { fail, id, integer, object, string } from './http'
import type { StoreSettings } from './store'

export function parseBuild(input: unknown): Build {
  const value = object(input)
  const build: Build = {}
  for (const name of Object.keys(value)) {
    const category = categories.find(item => item === name)
    if (!category) fail(400, 'build_category', 'В сборке указана неизвестная категория.')
    build[category] = id(value[name], 'комплектующее')
  }
  return build
}

function optionalAsset(value: unknown): string {
  const asset = string(value, 300, 'адрес файла', false)
  if (!asset) return ''
  if (/^\/api\/media\/[a-z0-9_-]+(?:\?store=[a-z0-9_-]+)?$/.test(asset)) return asset
  if (!/^\/(assets|models|images|textures|logos|products)\/(?:[\w.-]+\/)*[\w.-]+$/.test(asset)
      || asset.split('/').some(segment => segment === '..' || segment === '.')) {
    return fail(400, 'asset_url', 'Укажите допустимый локальный адрес файла.')
  }
  return asset
}

function secureSource(value: unknown): string {
  const url = string(value, 2000, 'источник')
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href
  } catch {
    // Invalid manufacturer URL.
  }
  return fail(400, 'source_url', 'Укажите HTTPS-адрес источника.')
}

function finite(value: unknown, label: string, minimum = 0, maximum = 2_000_000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return fail(400, 'validation', `Некорректное числовое поле «${label}».`)
  }
  return value
}

function validateJson(value: unknown, depth = 0): void {
  if (depth > 7) fail(400, 'specs_depth', 'Характеристики вложены слишком глубоко.')
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'number') {
    finite(value, 'характеристика', -2_000_000, 2_000_000)
    return
  }
  if (typeof value === 'string' && value.length <= 2000) return
  if (Array.isArray(value) && value.length <= 60) {
    for (const entry of value) validateJson(entry, depth + 1)
    return
  }
  const record = object(value)
  if (Object.keys(record).length > 100) fail(400, 'specs_fields', 'Указано слишком много характеристик.')
  for (const [key, entry] of Object.entries(record)) {
    if (key.length > 100 || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      fail(400, 'specs_key', 'Недопустимое название характеристики.')
    }
    validateJson(entry, depth + 1)
  }
}

const socket = ['AM4', 'AM5', 'LGA1700', 'LGA1851']
const form = ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX']
const psuForm = ['ATX', 'SFX', 'SFX-L']
const storage = ['M.2 NVMe', 'M.2 SATA', 'SATA']
const location = ['front', 'top', 'rear', 'bottom', 'side']
const numericSpecs = [
  'memorySlots', 'memoryModules', 'capacityGb', 'speedMts', 'cores', 'threads', 'vramGb',
  'gpuSlots', 'gpuClearanceMm', 'gpuHeightClearanceMm', 'gpuSlotClearance', 'coolerClearanceMm',
  'coolerHeightMm', 'radiatorMm', 'radiatorThicknessMm', 'fanSizeMm', 'fanCount', 'maxRpm',
  'psuClearanceMm', 'psuLengthMm', 'psuWatts', 'recommendedPsuWatts', 'storageMounts', 'storageLengthMm', 'wattage',
  'maxPowerW', 'maxMemoryGb', 'moduleHeightMm', 'eAtxWidthLimitMm', 'cableClearanceMm', 'gpuCableClearanceMm',
  'fanThicknessMm', 'topRadiatorFanStackLimitMm', 'top140RadiatorFanStackLimitMm', 'front360GpuClearanceMm',
  'psuClearanceWithTwoDriveTraysMm',
]

function option<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  const item = allowed.find(candidate => candidate === value)
  if (item === undefined) return fail(400, 'validation', `Некорректное поле «${label}».`)
  return item
}

function list(value: unknown, maximum: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(400, 'validation', `Некорректный список «${label}».`)
  return value
}

function parseSpecs(input: unknown): Specs {
  const value = object(input)
  validateJson(value)
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 16 * 1024) {
    fail(400, 'specs_size', 'Характеристики превышают 16 КиБ.')
  }
  for (const field of numericSpecs) if (field in value) finite(value[field], field)
  for (const field of ['chipset', 'family', 'bios', 'output']) {
    if (field in value) string(value[field], 150, field)
  }
  for (const [field, allowed] of [
    ['socket', socket], ['formFactor', form], ['psuFormFactor', psuForm], ['storageInterface', storage], ['memoryType', ['DDR4', 'DDR5']],
  ] as const) {
    if (field in value) option(value[field], allowed, field)
  }
  for (const [field, allowed] of [['sockets', socket], ['formFactors', form], ['psuFormFactors', psuForm]] as const) {
    if (field in value) for (const item of list(value[field], 12, field)) option(item, allowed, field)
  }
  for (const field of ['connectors', 'powerConnectors', 'storagePorts']) {
    if (field in value) for (const amount of Object.values(object(value[field]))) integer(amount, 0, 100, field)
  }
  if ('biosRequired' in value) for (const entry of Object.values(object(value.biosRequired))) string(entry, 120, 'версия BIOS')
  if ('cpuFamilies' in value) for (const item of list(value.cpuFamilies, 20, 'семейства CPU')) string(item, 100, 'семейство CPU')
  if ('m2LengthsMm' in value) for (const item of list(value.m2LengthsMm, 12, 'длины M.2')) integer(item, 20, 200, 'длина M.2')
  for (const field of ['rgb', 'hasIntegratedGraphics', 'integratedGraphics', 'lowProfile', 'top280RequiresLowProfileRam', 'biosVerifiedAllCpu']) {
    if (field in value && typeof value[field] !== 'boolean') fail(400, 'validation', `Некорректное поле «${field}».`)
  }
  if ('fanMounts' in value) {
    for (const mount of list(value.fanMounts, 12, 'крепления')) {
      const fan = object(mount)
      option(fan.location, location, 'место установки')
      integer(fan.quantity, 1, 12, 'количество вентиляторов')
      for (const size of list(fan.fanSizes, 8, 'размеры вентиляторов')) integer(size, 40, 250, 'размер вентилятора')
      if (fan.fanSizeLimits !== undefined) {
        for (const [size, quantity] of Object.entries(object(fan.fanSizeLimits))) {
          integer(Number(size), 40, 250, 'размер вентилятора')
          integer(quantity, 0, 12, 'ограничение количества вентиляторов')
        }
      }
      if (fan.radiatorSizes !== undefined) {
        for (const size of list(fan.radiatorSizes, 8, 'размеры радиаторов')) integer(size, 80, 600, 'размер радиатора')
      }
    }
  }
  if ('mountOffsetMm' in value) {
    const axes = object(value.mountOffsetMm)
    if (Object.keys(axes).length !== 3) fail(400, 'validation', 'Укажите три компоненты точки установки.')
    for (const axis of ['x', 'y', 'z']) finite(axes[axis], 'смещение оси', -100, 100)
  }
  if ('mountRotationDeg' in value) finite(value.mountRotationDeg, 'угол поворота', -180, 180)
  return value as Specs
}

export function parsePart(input: unknown): Part {
  const value = object(input)
  const category = option(value.category, categories, 'категория')
  const priceStatus = option(value.priceStatus, ['demo', 'verified'], 'статус цены')
  const checkedAt = string(value.checkedAt, 10, 'дата проверки')
  const date = new Date(`${checkedAt}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== checkedAt) {
    fail(400, 'validation', 'Укажите действительную дату проверки в формате YYYY-MM-DD.')
  }
  if (typeof value.inStock !== 'boolean') fail(400, 'validation', 'Укажите наличие комплектующей.')
  const dimensions = value.dimensions === undefined ? undefined : object(value.dimensions)
  return {
    id: id(value.id),
    category,
    name: string(value.name, 180, 'название'),
    brand: string(value.brand, 80, 'производитель'),
    model: string(value.model, 120, 'модель'),
    price: integer(value.price, 0, 10_000_000, 'цена'),
    priceStatus,
    inStock: value.inStock,
    colors: list(value.colors, 12, 'цвета').map(color => string(color, 50, 'цвет')),
    dimensions: dimensions && {
      width: finite(dimensions.width, 'ширина', 0.1, 1500),
      height: finite(dimensions.height, 'высота', 0.1, 1500),
      depth: finite(dimensions.depth, 'глубина', 0.1, 1500),
    },
    specs: parseSpecs(value.specs),
    source: secureSource(value.source),
    checkedAt,
    image: optionalAsset(value.image) || undefined,
    modelUrl: optionalAsset(value.modelUrl) || undefined,
    modelStatus: value.modelStatus === undefined ? undefined : option(value.modelStatus, ['reference', 'approximation'] as const, 'статус 3D'),
  }
}

export function parsePreset(input: unknown): Preset {
  const value = object(input)
  const build = parseBuild(value.build)
  if (!Object.keys(build).length) fail(400, 'validation', 'Сохраните хотя бы одну комплектующую.')
  return {
    id: id(value.id), name: string(value.name, 120, 'название'),
    description: string(value.description, 700, 'описание', false), use: string(value.use, 120, 'назначение'), build,
  }
}

export function parsePromoCode(value: unknown, required = false): string {
  const code = string(value, 36, 'промокод', required).toUpperCase()
  if (code && !/^[A-Z0-9_-]{1,36}$/.test(code)) fail(400, 'promo', 'Проверьте формат промокода.')
  return code
}

function approvedOrigin(value: unknown): string {
  const candidate = string(value, 250, 'разрешённый домен')
  try {
    const url = new URL(candidate)
    if (url.protocol === 'https:' && url.origin === candidate) return url.origin
  } catch {
    // Invalid origin.
  }
  return fail(400, 'origin', 'Укажите HTTPS origin без пути или параметров.')
}

export function parseSettings(input: unknown, current: StoreSettings): StoreSettings {
  const value = { ...current, ...object(input) }
  const accent = string(value.accent, 7, 'фирменный цвет')
  if (!/^#[0-9a-f]{6}$/i.test(accent)) fail(400, 'validation', 'Допустимый фирменный цвет задан в формате #RRGGBB.')
  if (typeof value.telegramEnabled !== 'boolean') fail(400, 'validation', 'Укажите состояние уведомлений.')
  const services = list(value.services, 20, 'услуги').map(input => {
    const item = object(input)
    return { id: id(item.id), name: string(item.name, 120, 'название услуги'), price: integer(item.price, 0, 1_000_000, 'цена услуги') }
  })
  if (services.some(service => service.id === 'assembly') || new Set(services.map(service => service.id)).size !== services.length) {
    fail(400, 'validation', 'Услуги должны иметь разные идентификаторы, а assembly зарезервирован.')
  }
  const promotions = list(value.promotions, 100, 'промокоды').map(input => {
    const item = object(input)
    if (typeof item.active !== 'boolean') fail(400, 'validation', 'Укажите состояние промокода.')
    return { code: parsePromoCode(item.code, true), percent: integer(item.percent, 1, 90, 'скидка'), active: item.active }
  })
  if (new Set(promotions.map(promo => promo.code)).size !== promotions.length) fail(400, 'validation', 'Промокоды должны быть уникальны.')
  return {
    name: string(value.name, 100, 'магазин'), logoUrl: optionalAsset(value.logoUrl), accent,
    contact: string(value.contact, 300, 'контакты', false), telegramEnabled: value.telegramEnabled,
    embedOrigins: [...new Set(list(value.embedOrigins, 30, 'домены встраивания').map(approvedOrigin))],
    apiOrigins: [...new Set(list(value.apiOrigins, 30, 'источники API').map(approvedOrigin))],
    assemblyFee: integer(value.assemblyFee, 0, 1_000_000, 'цена сборки'), services, promotions,
  }
}

export function parseEmail(value: unknown, required = false): string {
  const email = string(value, 254, 'почта', required).toLowerCase()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'email', 'Проверьте адрес электронной почты.')
  return email
}

export function parseCustomer(input: unknown) {
  const value = object(input)
  const name = string(value.name, 120, 'имя')
  const email = parseEmail(value.email)
  const phone = string(value.phone, 32, 'телефон', false)
  const comment = string(value.comment, 1200, 'комментарий', false)
  if (phone && (!/^[\d+(). -]+$/.test(phone) || phone.replace(/\D/g, '').length < 7)) {
    fail(400, 'phone', 'Проверьте номер телефона.')
  }
  if (!email && !phone) fail(400, 'contact', 'Укажите почту или телефон.')
  return { name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), ...(comment ? { comment } : {}) }
}

export function parseServiceIds(input: unknown): string[] {
  if (input === undefined) return []
  return [...new Set(list(input, 20, 'услуги').map(item => id(item, 'услуга')))]
}
