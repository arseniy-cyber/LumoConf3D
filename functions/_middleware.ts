import type { AppEnv } from '../worker/environment'
import { isLoopback, securityHeaders } from '../worker/http'
import { isLicensed, lookupStore, settingsFor } from '../worker/store'

export const onRequest: PagesFunction<AppEnv> = async context => {
  const url = new URL(context.request.url)
  if (url.pathname.startsWith('/api/')) return context.next()
  if (url.protocol === 'http:' && !isLoopback(url)) {
    url.protocol = 'https:'
    return Response.redirect(url.href, 308)
  }
  const response = await context.next()
  if (!response.headers.get('Content-Type')?.includes('text/html')) return response
  let embedOrigins: string[] = []
  if (!url.pathname.startsWith('/admin')) {
    try {
      const store = await lookupStore(context.request, context.env)
      if (store && isLicensed(store)) embedOrigins = settingsFor(store).embedOrigins
    } catch {
      // Keep the frame restriction when the tenant lookup fails.
    }
  }
  return securityHeaders(context.request, response, { embedOrigins, document: true })
}
