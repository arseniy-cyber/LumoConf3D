import { checkCompatibility, type CompatibilityOptions } from '../src/shared/compatibility'
import { categories, type Build, type MountLocation, type Part, type Preset } from '../src/shared/types'
import { keyedDigest, validKey } from './crypto'
import type { AppEnv } from './environment'
import { fail, id, integer, json, object, readJson, string } from './http'
import { isLicensed, requireLicensed, settingsFor, turnstileReady, verifyTurnstile, type Service, type Store } from './store'
import { parseBuild, parseCustomer, parsePromoCode, parseServiceIds } from './validation'

interface OrderRow {
  id: string
  status: string
  total: number
  currency: string
  request_hash: string
}

export interface ProductRow {
  id: string
  data: string
  archived: number
}

const requiredParts = ['case', 'cpu', 'motherboard', 'ram', 'cooler', 'psu', 'storage'] as const
const locations: MountLocation[] = ['front', 'top', 'rear', 'bottom', 'side']
const maxPublicBatch = 500

function snapshot(part: Part) {
  return { id: part.id, category: part.category, name: part.name, price: part.price, priceStatus: part.priceStatus }
}

function pickParts(build: Build): string[] {
  return categories.flatMap(category => build[category] || [])
}

export async function selectedParts(env: AppEnv, store: Store, build: Build): Promise<Part[]> {
  const ids = pickParts(build)
  if (!ids.length) return []
  const params = ids.map(() => '?').join(',')
  const { results } = await env.DB.prepare(`SELECT id,data,archived FROM products WHERE store_id=? AND id IN (${params})`)
    .bind(store.id, ...ids).all<ProductRow>()
  const byId = new Map(results.map(row => [row.id, row]))
  return categories.flatMap(category => {
    const id = build[category]
    if (!id) return []
    const row = byId.get(id)
    if (!row || row.archived) fail(400, 'part_missing', 'Комплектующая больше недоступна в каталоге.', { category, id })
    const part = JSON.parse(row.data) as Part
    if (part.category !== category) fail(400, 'part_category', 'Комплектующая указана в другой категории.', { category, id })
    return part
  })
}

export async function getCatalog(env: AppEnv, store: Store, url: URL): Promise<Response> {
  const category = url.searchParams.get('category')
  if (category && !categories.some(candidate => candidate === category)) fail(400, 'category', 'Неизвестная категория.')
  const offset = Number(url.searchParams.get('offset') || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 250_000) fail(400, 'offset', 'Некорректная страница каталога.')
  const select = 'SELECT id,data,archived FROM products WHERE store_id=? AND archived=0'
  const statement = category
    ? env.DB.prepare(`${select} AND category=? ORDER BY name,id LIMIT ? OFFSET ?`).bind(store.id, category, maxPublicBatch + 1, offset)
    : env.DB.prepare(`${select} ORDER BY category,name,id LIMIT ? OFFSET ?`).bind(store.id, maxPublicBatch + 1, offset)
  const { results } = await statement.all<ProductRow>()
  const more = results.length > maxPublicBatch
  const products: Part[] = results.slice(0, maxPublicBatch).map(row => JSON.parse(row.data))
  return json({ products, nextOffset: more ? offset + maxPublicBatch : null }, 200, { 'Cache-Control': 'public, max-age=45' })
}

export function publicStore(env: AppEnv, store: Store, request: Request): Response {
  const { name, logoUrl, accent, contact, assemblyFee, services } = settingsFor(store)
  const hosts = env.TURNSTILE_HOSTNAMES.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
  const formHost = new URL(request.headers.get('Origin') || request.url).hostname.toLowerCase()
  const checkoutEnabled = isLicensed(store) && turnstileReady(env) && validKey(env.RATE_LIMIT_KEY) && hosts.includes(formHost)
  return json({
    store: {
      slug: store.slug, name, logoUrl, accent, contact, assemblyFee, services, currency: store.currency,
      turnstileSiteKey: checkoutEnabled ? env.TURNSTILE_SITE_KEY : '', checkoutEnabled,
    },
  })
}

function getOptions(input: unknown): CompatibilityOptions {
  if (input === undefined) return {}
  const raw = object(input)
  const result: CompatibilityOptions = {}
  for (const field of ['fanLocation', 'radiatorLocation'] as const) {
    if (!(field in raw)) continue
    const location = locations.find(value => value === raw[field])
    if (!location) fail(400, 'mount_location', 'Указано неизвестное место установки.')
    result[field] = location
  }
  return result
}

function fields(input: Record<string, unknown>) {
  return {
    build: parseBuild(input.parts),
    serviceIds: parseServiceIds(input.services),
    promoCode: parsePromoCode(input.promoCode),
    options: getOptions(input.options),
  }
}

async function prepareQuote(env: AppEnv, store: Store, request: ReturnType<typeof fields>) {
  const parts = await selectedParts(env, store, request.build)
  const settings = settingsFor(store)
  const allServices: Service[] = [{ id: 'assembly', name: 'Сборка компьютера', price: settings.assemblyFee }, ...settings.services]
  const services = request.serviceIds.map(serviceId => {
    const service = allServices.find(candidate => candidate.id === serviceId)
    if (!service) fail(400, 'service', 'Одна из выбранных услуг больше недоступна.')
    return service
  })
  const promotion = settings.promotions.find(promo => promo.code === request.promoCode && promo.active)
  if (request.promoCode && !promotion) fail(400, 'promo', 'Этот промокод отсутствует или не действует.')
  const partsSubtotal = parts.reduce((sum, part) => sum + part.price, 0)
  const servicesSubtotal = services.reduce((sum, service) => sum + service.price, 0)
  const discount = promotion ? Math.floor(partsSubtotal * promotion.percent / 100) : 0
  const pricing = {
    partsSubtotal, servicesSubtotal, discount, total: partsSubtotal + servicesSubtotal - discount, currency: store.currency,
    promoCode: promotion?.code, parts: parts.map(snapshot), services, hasDemoPrices: parts.some(part => part.priceStatus === 'demo'),
  }
  const compatibility = checkCompatibility(request.build, parts, request.options)
  return { pricing, compatibility, parts }
}

export async function quote(request: Request, env: AppEnv, store: Store): Promise<Response> {
  const input = fields(await readJson(request))
  const { pricing, compatibility } = await prepareQuote(env, store, input)
  return json({ pricing, compatibility })
}

function orderResponse(row: Pick<OrderRow, 'id' | 'status' | 'total' | 'currency'>) {
  const { id, status, total, currency } = row
  return json({ order: { id, status, total, currency } }, 201)
}

function orderKey(request: Request): string | null {
  const value = request.headers.get('Idempotency-Key')
  if (value === null) return null
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(value)) fail(400, 'idempotency_key', 'Некорректный ключ запроса.')
  return value
}

async function lookupOrder(env: AppEnv, store: Store, key: string): Promise<OrderRow | null> {
  return env.DB.prepare('SELECT id,status,total,currency,request_hash FROM orders WHERE store_id=? AND idempotency_key=?')
    .bind(store.id, key).first<OrderRow>()
}

function checkDuplicate(existing: OrderRow, hash: string | null): Response {
  if (existing.request_hash !== hash) return fail(409, 'idempotency_conflict', 'Этот ключ уже использован для другой заявки.')
  return orderResponse(existing)
}

async function notifyTelegram(env: AppEnv, store: Store, order: { id: string; total: number; currency: string }) {
  if (!settingsFor(store).telegramEnabled || env.TELEGRAM_STORE !== store.slug || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN) || !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID)) return
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `Новая заявка LUMO\n№ ${order.id}\n${order.total} ${order.currency}` }),
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Telegram status')
    await response.body?.cancel()
  } catch {
    console.warn(JSON.stringify({ event: 'telegram_delivery_failed', store: store.slug, order: order.id }))
  }
}

export async function order(
  request: Request, env: AppEnv, store: Store, waitUntil: (work: Promise<unknown>) => void,
): Promise<Response> {
  requireLicensed(store)
  const body = await readJson(request)
  const input = fields(body)
  const customer = parseCustomer(body.customer)
  const expected = body.expectedTotal === undefined ? undefined : integer(body.expectedTotal, 0, 100_000_000, 'итог')
  const key = orderKey(request)
  const canonicalParts = categories.map(category => input.build[category] ?? null)
  const secret = env.RATE_LIMIT_KEY
  if (!validKey(secret)) fail(503, 'protection_setup', 'Защита этого действия ещё не настроена.')
  const hash = key
    ? await keyedDigest(secret, `order-v1:${JSON.stringify([canonicalParts, input.serviceIds.slice().sort(), input.promoCode, input.options, customer, expected])}`)
    : null
  if (key) {
    const existing = await lookupOrder(env, store, key)
    if (existing) return checkDuplicate(existing, hash)
  }
  const missing = requiredParts.filter(category => !input.build[category])
  if (missing.length) fail(422, 'build_incomplete', 'Добавьте обязательные комплектующие.', { missing })
  const { pricing, compatibility, parts } = await prepareQuote(env, store, input)
  const unavailable = parts.filter(part => !part.inStock).map(part => part.id)
  if (unavailable.length) fail(409, 'availability', 'Одна из комплектующих больше не в наличии.', { unavailable })
  const cpu = parts.find(part => part.category === 'cpu')
  if (!input.build.gpu && cpu?.specs.hasIntegratedGraphics !== true && cpu?.specs.integratedGraphics !== true) {
    fail(422, 'graphics', 'Добавьте видеокарту для выбранного процессора.')
  }
  if (compatibility.status === 'incompatible') {
    fail(422, 'compatibility', 'В выбранной сборке обнаружена несовместимость.', compatibility)
  }
  if (expected !== undefined && expected !== pricing.total) {
    fail(409, 'quote_changed', 'Стоимость изменилась. Подтвердите новый расчёт.', { pricing })
  }
  const token = string(body.turnstileToken, 2048, 'токен проверки')
  await verifyTurnstile(env, request, token)
  const id = crypto.randomUUID()
  const created = await env.DB.prepare(
    `INSERT OR IGNORE INTO orders
     (store_id,id,idempotency_key,request_hash,customer,parts,services,pricing,options,total,currency)
     SELECT id,?,?,?,?,?,?,?,?,?,currency FROM stores
     WHERE id=? AND catalog_version=? AND license_status IN ('trial','active')
     AND ((license_until IS NULL AND license_status='active') OR license_until>unixepoch())`,
  ).bind(
    id, key, hash, JSON.stringify(customer), JSON.stringify(pricing.parts), JSON.stringify(pricing.services),
    JSON.stringify(pricing), JSON.stringify(input.options), pricing.total, store.id, store.catalog_version,
  ).run()
  if (!created.meta.changes) {
    if (key) {
      const existing = await lookupOrder(env, store, key)
      if (existing) return checkDuplicate(existing, hash)
    }
    fail(409, 'quote_changed', 'Магазин изменил данные. Обновите расчёт перед отправкой заявки.')
  }
  const order = { id, status: 'new', total: pricing.total, currency: pricing.currency }
  waitUntil(notifyTelegram(env, store, order))
  return orderResponse(order)
}

export async function saveBuild(request: Request, env: AppEnv, store: Store): Promise<Response> {
  const { build: input, name: rawName } = await readJson(request)
  const build = parseBuild(input)
  if (!pickParts(build).length) fail(400, 'build', 'Добавьте комплектующую перед сохранением.')
  await selectedParts(env, store, build)
  const name = string(rawName, 120, 'название', false) || 'Моя сборка'
  const id = crypto.randomUUID()
  await env.DB.prepare('INSERT INTO shared_builds (store_id,id,name,data) VALUES (?,?,?,?)')
    .bind(store.id, id, name, JSON.stringify(build)).run()
  return json({ id }, 201)
}

export async function getBuild(env: AppEnv, store: Store, rawId: string): Promise<Response> {
  const row = await env.DB.prepare('SELECT name,data FROM shared_builds WHERE store_id=? AND id=? AND created_at>=unixepoch()-2592000')
    .bind(store.id, id(rawId)).first<{ name: string; data: string }>()
  if (!row) return fail(404, 'build', 'Сборка не найдена или срок ссылки истёк.')
  return json({ build: JSON.parse(row.data) as Build, name: row.name })
}

export async function getPresets(env: AppEnv, store: Store): Promise<Response> {
  const { results } = await env.DB.prepare('SELECT data FROM presets WHERE store_id=? ORDER BY name LIMIT 250')
    .bind(store.id).all<{ data: string }>()
  return json({ presets: results.map(row => JSON.parse(row.data) as Preset) })
}
