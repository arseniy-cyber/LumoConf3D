import { Box, Cpu, Fan, Gpu, HardDrive, MemoryStick, Microchip, PlugZap, Snowflake } from 'lucide-react'
import { categories, type Build, type Category, type Part, type SceneOptions } from '../shared/types'

export const labels = {
  case: 'Корпус',
  gpu: 'Видеокарта',
  cpu: 'Процессор',
  motherboard: 'Материнская плата',
  ram: 'Оперативная память',
  cooler: 'Охлаждение',
  psu: 'Блок питания',
  storage: 'Накопитель',
  fan: 'Вентиляторы',
} satisfies Record<Category, string>

export const icons = {
  case: Box,
  gpu: Gpu,
  cpu: Cpu,
  motherboard: Microchip,
  ram: MemoryStick,
  cooler: Snowflake,
  psu: PlugZap,
  storage: HardDrive,
  fan: Fan,
} satisfies Record<Category, unknown>

export const categoryOrder: Category[] = ['case', 'cpu', 'gpu', 'motherboard', 'ram', 'cooler', 'psu', 'storage', 'fan']

export const defaultScene: SceneOptions = {
  mode: 'studio',
  quality: 'auto',
  powered: true,
  glass: true,
  exploded: 0,
  airflow: false,
  airflowDirection: 'intake',
  airflowSpeed: .5,
  fanLocation: 'front',
  rgbColor: '#a581ff',
  rgbBrightness: .8,
  rgbSpeed: .5,
  rgbEffect: 'static',
  rgbSync: true,
  rgbZones: {},
  animations: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  animationSpeed: 1,
}

export interface SavedBuild {
  id: string
  name: string
  build: Build
  options: SceneOptions
}

export interface BuilderState {
  build: Build
  options: SceneOptions
  name: string
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Storage may be disabled. */ }
}

export function parseBuild(value: unknown): Build {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  return Object.fromEntries(categories.flatMap(category => {
    const id = record[category]
    return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,95}$/.test(id) ? [[category, id]] : []
  }))
}

export function recoverBuild(fallback: Build, key: string): BuilderState {
  const params = new URLSearchParams(location.search)
  try {
    const shared = params.get('build')
    if (shared) {
      const build = parseBuild(JSON.parse(shared))
      if (Object.keys(build).length) return { build, name: 'Полученная сборка', options: defaultScene }
    }
  } catch { /* Ignore invalid share links. */ }
  const saved = readStorage<Partial<BuilderState> | null>(key, null)
  return {
    build: saved?.build ? parseBuild(saved.build) : fallback,
    name: typeof saved?.name === 'string' ? saved.name : 'Сборка LUMO',
    options: { ...defaultScene, ...saved?.options },
  }
}

export function getParts(build: Build, catalog: readonly Part[]) {
  return categoryOrder.flatMap(category => {
    const item = catalog.find(part => part.id === build[category] && part.category === category)
    return item ? [item] : []
  })
}

export function money(value: number, currency = 'RUB') {
  try {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return new Intl.NumberFormat('ru-RU').format(value)
  }
}

export function partCaption(part: Part): string {
  const spec = part.specs
  switch (part.category) {
    case 'case': return spec.formFactors?.[0] ? `${spec.formFactors[0]} · ${part.colors[0] ?? ''}` : part.brand
    case 'cpu': return [spec.cores && `${spec.cores} ядер`, spec.socket].filter(Boolean).join(' · ')
    case 'gpu': return [spec.vramGb && `${spec.vramGb} ГБ`, spec.wattage && `${spec.wattage} Вт`].filter(Boolean).join(' · ')
    case 'motherboard': return [spec.chipset, spec.formFactor, spec.memoryType].filter(Boolean).join(' · ')
    case 'ram': return [spec.capacityGb && `${spec.capacityGb} ГБ`, spec.memoryType, spec.speedMts && `${spec.speedMts} МТ/с`].filter(Boolean).join(' · ')
    case 'cooler': return [spec.radiatorMm ? 'СВО' : 'Воздушное', (spec.radiatorMm ?? spec.coolerHeightMm) && `${spec.radiatorMm ?? spec.coolerHeightMm} мм`].filter(Boolean).join(' · ')
    case 'psu': return [spec.psuWatts && `${spec.psuWatts} Вт`, spec.psuFormFactor].filter(Boolean).join(' · ')
    case 'storage': return [spec.capacityGb && `${spec.capacityGb >= 1000 ? `${spec.capacityGb / 1000} ТБ` : `${spec.capacityGb} ГБ`}`, spec.storageInterface].filter(Boolean).join(' · ')
    case 'fan': return [spec.fanSizeMm && `${spec.fanSizeMm} мм`, spec.rgb && 'RGB'].filter(Boolean).join(' · ')
  }
}

export function shareUrl(build: Build) {
  const url = new URL(location.href)
  url.searchParams.delete('shared')
  url.searchParams.set('build', JSON.stringify(build))
  return url.toString()
}
