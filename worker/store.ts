import type { AppEnv } from './environment'
import { digest, keyedDigest, validKey } from './crypto'
import { clientAddress, fail, id } from './http'

export interface Service {
  id: string
  name: string
  price: number
}

export interface Promotion {
  code: string
  percent: number
  active: boolean
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
  services: Service[]
  promotions: Promotion[]
}

export interface Store {
  id: string
  slug: string
  name: string
  currency: string
  settings: string
  license_status: 'trial' | 'active' | 'suspended'
  license_until: number | null
  catalog_version: number
}

const defaults: Omit<StoreSettings, 'name'> = {
  logoUrl: '',
  accent: '#d1fa61',
  contact: '',
  telegramEnabled: false,
  embedOrigins: [],
  apiOrigins: [],
  assemblyFee: 0,
  services: [],
  promotions: [],
}

export function settingsFor(store: Store): StoreSettings {
  return { ...defaults, ...JSON.parse(store.settings), name: store.name }
}

export function isLicensed(store: Store): boolean {
  if (store.license_status === 'suspended') return false
  if (store.license_until === null) return store.license_status === 'active'
  return store.license_until > Math.floor(Date.now() / 1000)
}

export async function lookupStore(request: Request, env: AppEnv): Promise<Store | null> {
  const url = new URL(request.url)
  const requested = url.searchParams.get('store')
  if (requested !== null) {
    return env.DB.prepare('SELECT * FROM stores WHERE slug=?').bind(id(requested, 'магазин')).first<Store>()
  }
  const hostStore = await env.DB.prepare(
    'SELECT stores.* FROM stores JOIN store_hosts ON store_hosts.store_id=stores.id WHERE store_hosts.hostname=?',
  ).bind(url.hostname.toLowerCase()).first<Store>()
  if (hostStore) return hostStore
  return env.DB.prepare('SELECT * FROM stores WHERE slug=?').bind(env.DEFAULT_STORE || 'lumo').first<Store>()
}

export function requireLicensed(store: Store): void {
  if (!isLicensed(store)) fail(403, 'license', 'Приём заявок этого магазина приостановлен.')
}

export async function limit(
  env: AppEnv,
  store: Store,
  request: Request,
  action: string,
  allowed: number,
  windowSeconds: number,
  protectedOperation = false,
  actor?: string,
): Promise<void> {
  if (!validKey(env.RATE_LIMIT_KEY)) {
    if (protectedOperation) fail(503, 'protection_setup', 'Защита этого действия ещё не настроена.')
    return
  }
  const now = Math.floor(Date.now() / 1000)
  const bucket = Math.floor(now / windowSeconds)
  const expires = (bucket + 1) * windowSeconds
  const identifier = actor === undefined ? `ip:${clientAddress(request)}` : `actor:${actor}`
  const key = await keyedDigest(env.RATE_LIMIT_KEY, `${store.id}:${action}:${bucket}:${identifier}`)
  const row = await env.DB.prepare(
    'INSERT INTO limits (key,hits,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits',
  ).bind(key, expires).first<{ hits: number }>()
  if (!row || row.hits > allowed) fail(429, 'rate_limit', 'Слишком много запросов. Попробуйте позже.')
}

export function turnstileReady(env: AppEnv): boolean {
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET && env.TURNSTILE_HOSTNAMES)
}

export async function verifyTurnstile(env: AppEnv, request: Request, token: string): Promise<void> {
  if (!turnstileReady(env) || !env.TURNSTILE_SECRET) fail(503, 'checkout_setup', 'Магазин ещё не подключил приём заявок.')
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token })
  const ip = request.headers.get('CF-Connecting-IP')
  if (ip) body.set('remoteip', ip)
  let result: { success?: boolean; action?: string; hostname?: string }
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error('Verification service status')
    result = await response.json()
  } catch {
    return fail(503, 'turnstile_unavailable', 'Сервис проверки временно недоступен.')
  }
  const allowed = env.TURNSTILE_HOSTNAMES.split(',').map(hostname => hostname.trim().toLowerCase()).filter(Boolean)
  const expectedHost = new URL(request.headers.get('Origin') || request.url).hostname.toLowerCase()
  if (result.success !== true || result.action !== 'quote_order' || !allowed.includes(expectedHost)
      || result.hostname?.toLowerCase() !== expectedHost) {
    fail(403, 'turnstile', 'Проверка безопасности не пройдена. Получите новый токен.')
  }
  const record = await env.DB.prepare(
    'INSERT OR IGNORE INTO turnstile_tokens (digest,expires_at) VALUES (?,unixepoch()+600)',
  ).bind(await digest(token)).run()
  if (!record.meta.changes) fail(403, 'turnstile_replay', 'Срок действия проверки истёк. Получите новый токен.')
}

export function audit(env: AppEnv, store: Store, userId: string, action: string, target?: string) {
  return env.DB.prepare('INSERT INTO audit_log (store_id,user_id,action,target) VALUES (?,?,?,?)')
    .bind(store.id, userId, action, target ?? null)
}

export async function cleanup(db: D1Database): Promise<void> {
  const statements = [
    'DELETE FROM limits WHERE key IN (SELECT key FROM limits WHERE expires_at<unixepoch() LIMIT 1000)',
    'DELETE FROM sessions WHERE rowid IN (SELECT rowid FROM sessions WHERE expires_at<unixepoch() LIMIT 1000)',
    'DELETE FROM turnstile_tokens WHERE digest IN (SELECT digest FROM turnstile_tokens WHERE expires_at<unixepoch() LIMIT 1000)',
    'DELETE FROM shared_builds WHERE rowid IN (SELECT rowid FROM shared_builds WHERE created_at<unixepoch()-2592000 LIMIT 1000)',
  ]
  await db.batch(statements.map(statement => db.prepare(statement)))
}
