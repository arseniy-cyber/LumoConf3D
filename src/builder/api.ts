import type { Build, Part, Preset } from '../shared/types'

export interface Store {
  slug: string
  name: string
  logoUrl?: string
  accent?: string
  contact?: string
  currency: string
  assemblyFee: number
  services: { id: string; name: string; price: number }[]
  turnstileSiteKey?: string
  checkoutEnabled: boolean
}

const storeKey = new URLSearchParams(location.search).get('store')
export const storageSuffix = storeKey ? `-${storeKey}` : ''
export const demoStore: Store = { slug: 'lumo', name: 'LUMO', currency: 'RUB', assemblyFee: 0, services: [], checkoutEnabled: false }

export async function api<T>(path: string, data?: unknown, headers?: Record<string, string>): Promise<T> {
  const url = new URL(`/api${path}`, location.origin)
  if (storeKey) url.searchParams.set('store', storeKey)
  const response = await fetch(url, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: data === undefined ? undefined : { 'Content-Type': 'application/json', ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  const result = await response.json().catch(() => undefined)
  if (!response.ok || !result) throw new Error(result?.error?.message ?? 'Сервис временно недоступен.')
  return result as T
}

export function getStore() {
  return api<{ store: Store }>('/store')
}

export async function getCatalog(): Promise<{ products: Part[] }> {
  const url = new URL('/api/catalog', location.origin)
  if (storeKey) url.searchParams.set('store', storeKey)
  const products: Part[] = []
  let offset = 0
  for (;;) {
    url.searchParams.set('offset', String(offset))
    const response = await fetch(url, { credentials: 'same-origin' })
    if (!response.ok) throw new Error('Каталог временно недоступен.')
    const result: { products: Part[]; nextOffset: number | null } = await response.json()
    products.push(...result.products)
    if (!Number.isSafeInteger(result.nextOffset) || result.nextOffset === null || result.nextOffset <= offset || result.nextOffset > 250_000) break
    offset = result.nextOffset
  }
  return { products }
}

export function getPresets() {
  return api<{ presets: Preset[] }>('/presets')
}

export function saveShare(build: Build, name: string) {
  return api<{ id: string }>('/builds', { build, name })
}
