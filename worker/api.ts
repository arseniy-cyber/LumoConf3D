import { handleAdmin } from './admin'
import { getBuild, getCatalog, getPresets, order, publicStore, quote, saveBuild } from './commerce'
import type { AppEnv } from './environment'
import { errorResponse, fail, id, isLoopback, json, securityHeaders } from './http'
import { getMedia } from './media'
import { cleanup, limit, lookupStore, settingsFor } from './store'

export async function handleApi(
  request: Request, env: AppEnv, waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const url = new URL(request.url)
  let corsOrigin: string | undefined
  let response: Response
  try {
    if (url.protocol === 'http:' && !isLoopback(url)) {
      url.protocol = 'https:'
      return securityHeaders(request, Response.redirect(url.href, 308))
    }
    const [, api, route, resource, target, extra] = url.pathname.replace(/\/$/, '').split('/')
    if (api !== 'api' || !route || extra) fail(404, 'endpoint', 'Запрашиваемый раздел не найден.')
    const store = await lookupStore(request, env)
    if (!store) fail(404, 'store', 'Магазин не найден.')
    const origin = request.headers.get('Origin')
    if (origin && origin !== url.origin) {
      if (route === 'admin' || !settingsFor(store).apiOrigins.includes(origin)) {
        fail(403, 'cors', 'Источник запроса не разрешён.')
      }
      corsOrigin = origin
    }
    const method = request.method
    if (method === 'OPTIONS' && corsOrigin) {
      response = new Response(null, { status: 204 })
    } else if (route === 'admin') {
      response = await handleAdmin(request, env, store, resource, target)
    } else {
      if (target) fail(404, 'endpoint', 'Запрашиваемый раздел не найден.')
      if (!resource && route === 'health' && method === 'GET') {
        response = json({ status: 'ok' })
      } else if (!resource && route === 'store' && method === 'GET') {
        response = publicStore(env, store, request)
      } else if (!resource && route === 'catalog' && method === 'GET') {
        await limit(env, store, request, 'catalog', 180, 60)
        response = await getCatalog(env, store, url)
      } else if (!resource && route === 'presets' && method === 'GET') {
        await limit(env, store, request, 'presets', 180, 60)
        response = await getPresets(env, store)
      } else if (!resource && route === 'quote' && method === 'POST') {
        await limit(env, store, request, 'quote', 50, 60)
        response = await quote(request, env, store)
      } else if (!resource && route === 'orders' && method === 'POST') {
        await limit(env, store, request, 'order', 8, 600, true)
        response = await order(request, env, store, waitUntil)
      } else if (!resource && route === 'builds' && method === 'POST') {
        await limit(env, store, request, 'save_build', 16, 600, true)
        response = await saveBuild(request, env, store)
      } else if (resource && route === 'builds' && method === 'GET') {
        await limit(env, store, request, 'get_build', 120, 60)
        response = await getBuild(env, store, resource)
      } else if (resource && route === 'media' && (method === 'GET' || method === 'HEAD')) {
        await limit(env, store, request, 'media', 180, 60)
        response = await getMedia(request, env, store, id(resource))
      } else {
        response = fail(404, 'endpoint', 'Запрашиваемый раздел не найден.')
      }
    }

    if (method !== 'GET' && method !== 'HEAD' && crypto.getRandomValues(new Uint8Array(1))[0] < 8) {
      waitUntil(cleanup(env.DB).catch(() => console.warn(JSON.stringify({ event: 'ephemeral_cleanup_failed' }))))
    }
  } catch (error) {
    response = errorResponse(error)
  }
  return securityHeaders(request, response, { embedOrigins: [], corsOrigin })
}
