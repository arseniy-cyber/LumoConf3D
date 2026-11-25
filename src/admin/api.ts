import type { Category, Part, Preset } from '../shared/types'

export type AdminRole = 'owner' | 'manager' | 'support'
export interface User {
  email: string
  role: AdminRole
  active?: boolean
  id?: string
}
interface Session {
  user: User
  csrfToken: string
}
export type OrderStatus = 'new' | 'review' | 'confirmed' | 'completed' | 'cancelled'
export const orderStatuses: Record<OrderStatus, string> = {
  new: 'Новый', review: 'На проверке', confirmed: 'Подтверждён', completed: 'Завершён', cancelled: 'Отменён',
}
export interface Order {
  id: string
  customer: { name: string; email?: string; phone?: string; comment?: string }
  status: OrderStatus
  createdAt: string
  total: number
  currency: string
  updatedAt?: string
  parts: Array<{ id: string; category: Category; name: string; price: number; priceStatus: Part['priceStatus'] }>
  services: StoreSettings['services']
  pricing: { partsSubtotal: number; servicesSubtotal: number; discount: number; total: number; currency: string; hasDemoPrices: boolean; promoCode?: string }
}
export interface StoreSettings {
  name: string
  logoUrl: string
  accent: string
  contact: string
  telegramEnabled: boolean
  embedOrigins: string[]
  apiOrigins: string[]
  assemblyFee: number
  services: Array<{ id: string; name: string; price: number }>
  promotions: Array<{ code: string; percent: number; active: boolean }>
}
export interface Stats {
  products: number
  available: number
  orders: number
  total: number
  currency?: string
}
export interface AuditEntry {
  user_id: string | null
  action: string
  target: string | null
  created_at: number
}
export class AdminRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

const errors: Record<number, string> = {
  400: 'Проверьте введённые данные.',
  401: 'Войдите в аккаунт администратора.',
  403: 'Для этого действия нужны дополнительные права.',
  404: 'Данные не найдены.',
  409: 'Запись уже существует или была изменена.',
  413: 'Размер файла превышает ограничение.',
  415: 'Формат файла не поддерживается.',
  422: 'Некоторые поля не прошли проверку.',
  429: 'Слишком много запросов. Повторите позже.',
  501: 'Функция пока не настроена на сервере.',
  503: 'Сервер управления временно недоступен.',
}

export class AdminApi {
  private csrfToken: string | undefined
  private readonly store = new URLSearchParams(location.search).get('store')

  get storeSlug(): string {
    return this.store ?? 'lumo'
  }

  private async request<T>(path: string, method = 'GET', data?: unknown, offset = 0): Promise<T> {
    const url = new URL(`/api/admin${path}`, location.origin)
    if (this.store) url.searchParams.set('store', this.store)
    if (offset) url.searchParams.set('offset', String(offset))
    const headers = new Headers({ Accept: 'application/json' })
    const body = data instanceof File ? data : data !== undefined ? JSON.stringify(data) : undefined
    if (data instanceof File) {
      const extension = data.name.split('.').at(-1)?.toLowerCase() ?? ''
      const types: Record<string, string> = { glb: 'model/gltf-binary', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
      headers.set('Content-Type', types[extension] ?? data.type)
    }
    if (typeof body === 'string') headers.set('Content-Type', 'application/json')
    if (method !== 'GET' && this.csrfToken) headers.set('X-CSRF-Token', this.csrfToken)

    let response: Response
    try {
      response = await fetch(url, { method, headers, body, credentials: 'same-origin', cache: 'no-store' })
    } catch {
      throw new AdminRequestError(0, 'Не удалось связаться с сервером.')
    }
    if (!response.ok) {
      let message = errors[response.status] ?? 'Сервер не смог выполнить запрос.'
      if (response.headers.get('content-type')?.includes('application/json')) {
        const payload: { error?: { message?: unknown } } | null = await response.json().catch(() => null)
        if (typeof payload?.error?.message === 'string' && payload.error.message.length <= 500) message = payload.error.message
      }
      throw new AdminRequestError(response.status, message)
    }
    if (response.status === 204) return undefined as T
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new AdminRequestError(503, 'API управления недоступен. Запустите приложение с Worker и базой D1.')
    }
    try {
      return await response.json() as T
    } catch {
      throw new AdminRequestError(503, 'Сервер вернул ответ, который не удалось прочитать.')
    }
  }

  async session(): Promise<User> {
    const result = await this.request<Session>('/session')
    this.csrfToken = result.csrfToken
    return result.user
  }

  async login(email: string, password: string, code: string): Promise<User> {
    const result = await this.request<Session>('/login', 'POST', { email, password, code })
    this.csrfToken = result.csrfToken
    return result.user
  }

  async logout(): Promise<void> {
    await this.request('/logout', 'POST')
    this.csrfToken = undefined
  }

  async products(): Promise<{ products: Part[]; archivedIds: string[] }> {
    const products: Part[] = []
    const archivedIds: string[] = []
    let offset = 0
    while (true) {
      const page = await this.request<{ products: Part[]; archivedIds: string[]; nextOffset: number | null }>('/products', 'GET', undefined, offset)
      products.push(...page.products)
      archivedIds.push(...(page.archivedIds ?? []))
      if (!page.nextOffset || page.nextOffset <= offset) return { products, archivedIds }
      offset = page.nextOffset
    }
  }
  async saveProduct(product: Part): Promise<void> {
    await this.request(`/products/${encodeURIComponent(product.id)}`, 'PUT', { product })
  }
  async archiveProduct(id: string): Promise<void> {
    await this.request(`/products/${encodeURIComponent(id)}`, 'DELETE')
  }
  async importProducts(products: Part[]): Promise<void> {
    await this.request('/products', 'PUT', { products })
  }

  async orders(offset = 0): Promise<{ orders: Order[]; nextOffset: number | null }> {
    return await this.request('/orders', 'GET', undefined, offset)
  }
  async setOrderStatus(id: string, status: OrderStatus): Promise<void> {
    await this.request(`/orders/${encodeURIComponent(id)}`, 'PATCH', { status })
  }

  async settings(): Promise<StoreSettings> {
    return (await this.request<{ settings: StoreSettings }>('/settings')).settings
  }
  async saveSettings(settings: StoreSettings): Promise<void> {
    await this.request('/settings', 'PUT', { settings })
  }
  async stats(): Promise<Stats> {
    return (await this.request<{ stats: Stats }>('/stats')).stats
  }

  async presets(): Promise<Preset[]> {
    return (await this.request<{ presets: Preset[] }>('/presets')).presets
  }
  async savePreset(preset: Preset): Promise<void> {
    await this.request(`/presets/${encodeURIComponent(preset.id)}`, 'PUT', { preset })
  }
  async deletePreset(id: string): Promise<void> {
    await this.request(`/presets/${encodeURIComponent(id)}`, 'DELETE')
  }

  async users(): Promise<User[]> {
    return (await this.request<{ users: User[] }>('/users')).users
  }
  async saveUser(email: string, role: AdminRole, password: string): Promise<{user: User; totpSecret: string; totpUri: string}> {
    return await this.request('/users', 'POST', { email, role, password })
  }
  async updateUser(id: string, active: boolean, role: AdminRole): Promise<void> {
    await this.request(`/users/${encodeURIComponent(id)}`, 'PATCH', { active, role })
  }

  async audit(): Promise<AuditEntry[]> {
    return (await this.request<{ entries: AuditEntry[] }>('/audit')).entries
  }

  async upload(file: File): Promise<string> {
    return (await this.request<{ url: string }>('/media', 'POST', file)).url
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Не удалось выполнить действие.'
}
