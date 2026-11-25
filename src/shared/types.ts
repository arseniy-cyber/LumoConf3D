export const categories = ['case', 'gpu', 'cpu', 'motherboard', 'ram', 'cooler', 'psu', 'storage', 'fan'] as const
export type Category = typeof categories[number]
export type Build = Partial<Record<Category, string>>
export type FormFactor = 'E-ATX' | 'ATX' | 'Micro-ATX' | 'Mini-ITX'
export type Socket = 'AM4' | 'AM5' | 'LGA1700' | 'LGA1851'
export type MemoryType = 'DDR4' | 'DDR5'
export type StorageInterface = 'M.2 NVMe' | 'M.2 SATA' | 'SATA'
export type MountLocation = 'front' | 'top' | 'rear' | 'bottom' | 'side'
export interface FanMount {
  location: MountLocation
  fanSizes: number[]
  quantity: number
  radiatorSizes?: number[]
}
export interface Specs {
  socket?: Socket
  sockets?: Socket[]
  formFactor?: FormFactor
  formFactors?: FormFactor[]
  memoryType?: MemoryType
  memorySlots?: number
  memoryModules?: number
  capacityGb?: number
  speedMts?: number
  chipset?: string
  cpuFamilies?: string[]
  family?: string
  cores?: number
  threads?: number
  bios?: string
  biosRequired?: Record<string, string>
  vramGb?: number
  gpuSlots?: number
  gpuClearanceMm?: number
  gpuHeightClearanceMm?: number
  gpuSlotClearance?: number
  coolerClearanceMm?: number
  coolerHeightMm?: number
  radiatorMm?: number
  radiatorThicknessMm?: number
  fanMounts?: FanMount[]
  fanSizeMm?: number
  fanCount?: number
  maxRpm?: number
  psuFormFactor?: 'ATX' | 'SFX' | 'SFX-L'
  psuFormFactors?: ('ATX' | 'SFX' | 'SFX-L')[]
  psuClearanceMm?: number
  psuLengthMm?: number
  psuWatts?: number
  recommendedPsuWatts?: number
  connectors?: Record<string, number>
  powerConnectors?: Record<string, number>
  storageInterface?: StorageInterface
  storagePorts?: Partial<Record<StorageInterface, number>>
  storageMounts?: number
  storageLengthMm?: number
  m2LengthsMm?: number[]
  wattage?: number
  rgb?: boolean
  output?: string
  [key: string]: unknown
}
export interface Part {
  id: string
  category: Category
  name: string
  brand: string
  model: string
  price: number
  priceStatus: 'demo' | 'verified'
  inStock: boolean
  colors: string[]
  dimensions?: { width: number; height: number; depth: number }
  specs: Specs
  source: string
  checkedAt: string
  image?: string
  modelUrl?: string
  modelStatus?: 'reference' | 'approximation'
}
export interface Preset {
  id: string
  name: string
  description: string
  use: string
  build: Build
}
export type SceneMode = 'studio' | 'light' | 'gaming' | 'technical'
export type SceneQuality = 'auto' | 'low' | 'high'
export type RgbEffect = 'static' | 'breathing' | 'wave' | 'rainbow' | 'sequence' | 'transition' | 'custom'
export interface SceneOptions {
  mode: SceneMode
  quality: SceneQuality
  lightTemperature?: number
  powered: boolean
  glass: boolean
  exploded: number
  explodedCategory?: Category
  hiddenCategories?: Category[]
  separatedGlass?: boolean
  finish?: string
  fanColors?: Partial<Record<MountLocation, string>>
  airflow: boolean
  airflowDirection: 'intake' | 'exhaust'
  airflowSpeed: number
  fanLocation: MountLocation
  rgbColor: string
  rgbBrightness: number
  rgbSpeed: number
  rgbEffect: RgbEffect
  rgbSync: boolean
  rgbZones: Partial<Record<Category, string>>
  animations: boolean
  animationSpeed: number
}
