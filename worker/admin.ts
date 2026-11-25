import {
  createUser, listUsers, login, logout, requireCsrf, requireRole, requireSession, sessionResponse, updateUser, type Session,
} from './auth'
import { getPresets, selectedParts, type ProductRow } from './commerce'
import type { AppEnv } from './environment'
import { fail, id, json, readJson } from './http'
import { uploadMedia } from './media'
import { audit, limit, settingsFor, type Store } from './store'
import { parsePart, parsePreset, parseSettings } from './validation'
import type { Part } from '../src/shared/types'

interface AdminOrderRow {
  id: string
  status: string
  customer: string
  parts: string
  services: string
  pricing: string
  options: string
  total: number
  currency: string
  created_at: number
  updated_at: number
}

const orderStatuses = ['new', 'review', 'confirmed', 'completed', 'cancelled']

function orderData(row: AdminOrderRow) {
  return {
    id: row.id, status: row.status, total: row.total, currency: row.currency,
    createdAt: new Date(row.created_at * 1000).toISOString(), updatedAt: new Date(row.updated_at * 1000).toISOString(),
    customer: JSON.parse(row.customer), parts: JSON.parse(row.parts), services: JSON.parse(row.services),
    pricing: JSON.parse(row.pricing), options: JSON.parse(row.options),
  }
}

async function orders(env: AppEnv, store: Store, request: Request) {
  const url = new URL(request.url)
  const offset = Number(url.searchParams.get('offset') || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 250_000) fail(400, 'offset', 'Некорректная страница заказов.')
  const { results } = await env.DB.prepare(
    'SELECT * FROM orders WHERE store_id=? ORDER BY created_at DESC,id LIMIT 101 OFFSET ?',
  ).bind(store.id, offset).all<AdminOrderRow>()
  return json({ orders: results.slice(0, 100).map(orderData), nextOffset: results.length > 100 ? offset + 100 : null })
}

async function updateOrder(request: Request, env: AppEnv, store: Store, actor: Session, orderId: string) {
  const { status } = await readJson(request, 1024)
  const option = orderStatuses.find(candidate => candidate === status)
  if (!option) fail(400, 'status', 'Укажите допустимый статус заказа.')
  const [changed] = await env.DB.batch([
    env.DB.prepare('UPDATE orders SET status=?,updated_at=unixepoch() WHERE store_id=? AND id=?')
      .bind(option, store.id, orderId),
    env.DB.prepare(
      `INSERT INTO audit_log (store_id,user_id,action,target) SELECT ?,?,?,? WHERE changes()=1`,
    ).bind(store.id, actor.user.id, 'update_order', `${orderId}:${option}`),
  ])
  if (!changed.meta.changes) fail(404, 'order', 'Заказ не найден.')
  return json({ order: { id: orderId, status: option } })
}

async function productList(env: AppEnv, store: Store, request: Request) {
  const url = new URL(request.url)
  const offset = Number(url.searchParams.get('offset') || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 250_000) fail(400, 'offset', 'Некорректная страница каталога.')
  const { results } = await env.DB.prepare(
    'SELECT id,data,archived FROM products WHERE store_id=? ORDER BY category,name,id LIMIT 1001 OFFSET ?',
  ).bind(store.id, offset).all<ProductRow>()
  const page = results.slice(0, 1000)
  return json({
    products: page.map(row => JSON.parse(row.data) as Part),
    archivedIds: page.filter(row => row.archived).map(row => row.id),
    nextOffset: results.length > 1000 ? offset + 1000 : null,
  })
}

async function validateMediaReferences(env: AppEnv, store: Store, refs: (string | undefined)[]) {
  const mediaIds = new Set<string>()
  for (const ref of refs) {
    if (!ref?.startsWith('/api/media/')) continue
    const [pathname, query] = ref.split('?')
    if (query && new URLSearchParams(query).get('store') !== store.slug) fail(400, 'media_store', 'Файл относится к другому магазину.')
    mediaIds.add(pathname.split('/')[3])
  }
  if (!mediaIds.size) return
  const groups: string[][] = []
  const values = [...mediaIds]
  for (let index = 0; index < values.length; index += 80) groups.push(values.slice(index, index + 80))
  const counts = await env.DB.batch<{ count: number }>(groups.map(ids => env.DB.prepare(
    `SELECT COUNT(*) AS count FROM media WHERE store_id=? AND id IN (${ids.map(() => '?').join(',')})`,
  ).bind(store.id, ...ids)))
  if (counts.reduce((sum, row) => sum + row.results[0].count, 0) !== mediaIds.size) {
    fail(400, 'media_reference', 'Загруженный файл не найден.')
  }
}

function savePartQuery(env: AppEnv, store: Store, part: Part) {
  return env.DB.prepare(
    `INSERT INTO products (store_id,id,category,name,data) VALUES (?,?,?,?,?)
     ON CONFLICT(store_id,id) DO UPDATE SET category=excluded.category,name=excluded.name,data=excluded.data,
     archived=0,updated_at=unixepoch()`,
  ).bind(store.id, part.id, part.category, part.name, JSON.stringify(part))
}

async function savePart(request: Request, env: AppEnv, store: Store, actor: Session, productId: string) {
  const { product } = await readJson(request, 96 * 1024)
  const part = parsePart(product)
  if (part.id !== productId) fail(400, 'product_id', 'Идентификатор комплектующей должен совпадать с адресом.')
  await validateMediaReferences(env, store, [part.image, part.modelUrl])
  await env.DB.batch([savePartQuery(env, store, part), audit(env, store, actor.user.id, 'save_product', part.id)])
  return json({ product: part })
}

async function importProducts(request: Request, env: AppEnv, store: Store, actor: Session) {
  const { products } = await readJson(request, 1_024 * 1_024)
  if (!Array.isArray(products) || !products.length || products.length > 100) {
    fail(400, 'import_count', 'Импортируйте от одной до ста комплектующих за запрос.')
  }
  const parts = products.map(parsePart)
  if (new Set(parts.map(part => part.id)).size !== parts.length) {
    fail(400, 'import_duplicate', 'В списке повторяются идентификаторы комплектующих.')
  }
  await validateMediaReferences(env, store, parts.flatMap(part => [part.image, part.modelUrl]))
  await env.DB.batch([
    ...parts.map(part => savePartQuery(env, store, part)),
    audit(env, store, actor.user.id, 'import_products', String(parts.length)),
  ])
  return json({ products: parts, count: parts.length })
}

async function archivePart(env: AppEnv, store: Store, actor: Session, productId: string) {
  const [changed] = await env.DB.batch([
    env.DB.prepare('UPDATE products SET archived=1,updated_at=unixepoch() WHERE store_id=? AND id=? AND archived=0')
      .bind(store.id, productId),
    env.DB.prepare(
      `INSERT INTO audit_log (store_id,user_id,action,target) SELECT ?,?,'archive_product',? WHERE changes()=1`,
    ).bind(store.id, actor.user.id, productId),
  ])
  if (!changed.meta.changes) fail(404, 'product', 'Активная комплектующая не найдена.')
  return json({ ok: true })
}

async function savePreset(request: Request, env: AppEnv, store: Store, actor: Session, presetId: string) {
  const { preset: input } = await readJson(request, 12 * 1024)
  const preset = parsePreset(input)
  if (preset.id !== presetId) fail(400, 'preset_id', 'Идентификатор сборки должен совпадать с адресом.')
  await selectedParts(env, store, preset.build)
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO presets (store_id,id,name,data) VALUES (?,?,?,?)
       ON CONFLICT(store_id,id) DO UPDATE SET name=excluded.name,data=excluded.data`,
    ).bind(store.id, preset.id, preset.name, JSON.stringify(preset)),
    audit(env, store, actor.user.id, 'save_preset', presetId),
  ])
  return json({ preset })
}

async function removePreset(env: AppEnv, store: Store, actor: Session, presetId: string) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM presets WHERE store_id=? AND id=?').bind(store.id, presetId),
    audit(env, store, actor.user.id, 'remove_preset', presetId),
  ])
  return json({ ok: true })
}

async function stats(env: AppEnv, store: Store) {
  const [products, orders] = await env.DB.batch<Record<string, number>>([
    env.DB.prepare(
      `SELECT COUNT(*) AS products,COALESCE(SUM(json_extract(data,'$.inStock')=1),0) AS available
       FROM products WHERE store_id=? AND archived=0`,
    ).bind(store.id),
    env.DB.prepare(
      `SELECT COUNT(*) AS orders,COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') THEN total ELSE 0 END),0)
       AS total FROM orders WHERE store_id=?`,
    ).bind(store.id),
  ])
  return json({ stats: { ...products.results[0], ...orders.results[0], currency: store.currency } })
}

async function saveSettings(request: Request, env: AppEnv, store: Store, actor: Session) {
  const { settings: input } = await readJson(request, 48 * 1024)
  const { name, ...settings } = parseSettings(input, settingsFor(store))
  await validateMediaReferences(env, store, [settings.logoUrl])
  const [updated] = await env.DB.batch([
    env.DB.prepare('UPDATE stores SET name=?,settings=?,catalog_version=catalog_version+1 WHERE id=? AND catalog_version=?')
      .bind(name, JSON.stringify(settings), store.id, store.catalog_version),
    env.DB.prepare(
      `INSERT INTO audit_log (store_id,user_id,action) SELECT ?,?,'update_settings' WHERE changes()=1`,
    ).bind(store.id, actor.user.id),
  ])
  if (!updated.meta.changes) fail(409, 'settings_changed', 'Данные магазина изменились. Обновите страницу и повторите.')
  return json({ settings: { name, ...settings } })
}

async function auditList(env: AppEnv, store: Store) {
  const { results } = await env.DB.prepare(
    'SELECT user_id,action,target,created_at FROM audit_log WHERE store_id=? ORDER BY id DESC LIMIT 150',
  ).bind(store.id).all()
  return json({ entries: results })
}

export async function handleAdmin(
  request: Request, env: AppEnv, store: Store, resource: string | undefined, target: string | undefined,
): Promise<Response> {
  const method = request.method
  if (resource === 'login' && method === 'POST' && !target) return login(request, env, store)

  await limit(env, store, request, 'admin', 140, 60)
  const actor = await requireSession(request, env, store)
  if (method !== 'GET') await requireCsrf(request, actor)

  if (resource === 'session' && method === 'GET' && !target) return sessionResponse(actor)
  if (resource === 'logout' && method === 'POST' && !target) return logout(request, env, store, actor)
  if (resource === 'stats' && method === 'GET' && !target) return stats(env, store)
  if (resource === 'orders') {
    if (!target && method === 'GET') return orders(env, store, request)
    if (target && method === 'PATCH') return updateOrder(request, env, store, actor, id(target))
  }
  if (resource === 'settings' && !target) {
    requireRole(actor, 'owner')
    if (method === 'GET') return json({ settings: settingsFor(store) })
    if (method === 'PUT') return saveSettings(request, env, store, actor)
  }
  if (resource === 'audit' && method === 'GET' && !target) {
    requireRole(actor, 'owner')
    return auditList(env, store)
  }
  if (resource === 'products') {
    requireRole(actor, 'owner', 'manager')
    if (!target && method === 'GET') return productList(env, store, request)
    if (!target && method === 'PUT') return importProducts(request, env, store, actor)
    if (target && method === 'PUT') return savePart(request, env, store, actor, id(target))
    if (target && method === 'DELETE') return archivePart(env, store, actor, id(target))
  }
  if (resource === 'presets') {
    requireRole(actor, 'owner', 'manager')
    if (method === 'GET' && !target) return getPresets(env, store)
    if (target && method === 'PUT') return savePreset(request, env, store, actor, id(target))
    if (target && method === 'DELETE') return removePreset(env, store, actor, id(target))
  }
  if (resource === 'media' && method === 'POST' && !target) return uploadMedia(request, env, store, actor)
  if (resource === 'users') {
    if (!target && method === 'GET') return listUsers(env, store, actor)
    if (!target && method === 'POST') return createUser(request, env, store, actor)
    if (target && method === 'PATCH') return updateUser(request, env, store, actor, id(target))
  }
  return fail(404, 'endpoint', 'Административный раздел не найден.')
}
