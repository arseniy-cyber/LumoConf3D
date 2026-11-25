export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new HttpError(status, code, message, details)
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers)
  result.set('Content-Type', 'application/json; charset=utf-8')
  if (!result.has('Cache-Control')) result.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { status, headers: result })
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(
      { error: { code: error.code, message: error.message, details: error.details } },
      error.status,
      error.status === 429 ? { 'Retry-After': '60' } : undefined,
    )
  }
  console.error(JSON.stringify({ event: 'unexpected_api_error', kind: error instanceof Error ? error.name : 'unknown' }))
  return json({ error: { code: 'internal', message: 'Сервис временно недоступен.' } }, 500)
}

export function isLoopback(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export function securityHeaders(
  request: Request,
  response: Response,
  policy?: { embedOrigins: string[]; corsOrigin?: string; document?: boolean },
): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  const url = new URL(request.url)
  if (url.protocol === 'https:' && !isLoopback(url)) headers.set('Strict-Transport-Security', 'max-age=31536000')
  const ancestors = policy?.embedOrigins.length ? ["'self'", ...policy.embedOrigins].join(' ') : "'none'"
  if (policy?.embedOrigins.length) headers.delete('X-Frame-Options')
  else headers.set('X-Frame-Options', 'DENY')
  if (policy?.document) {
    headers.set('Content-Security-Policy', [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "form-action 'self'",
      `frame-ancestors ${ancestors}`,
      "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
    ].join('; '))
  } else {
    headers.set('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  }
  if (policy && !policy.document) headers.append('Vary', 'Origin')
  if (policy?.corsOrigin) {
    headers.set('Access-Control-Allow-Origin', policy.corsOrigin)
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key')
    headers.set('Access-Control-Max-Age', '600')
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export async function readLimited(request: Request, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const claimed = request.headers.get('Content-Length')
  if (claimed && (!/^\d+$/.test(claimed) || Number(claimed) > maximum)) {
    return fail(413, 'body_limit', 'Размер запроса превышает допустимый.')
  }
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maximum) {
        await reader.cancel()
        return fail(413, 'body_limit', 'Размер запроса превышает допустимый.')
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

export async function readJson(request: Request, maximum = 24 * 1024): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    return fail(415, 'content_type', 'Ожидается application/json.')
  }
  const bytes = await readLimited(request, maximum)
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes))
  } catch {
    return fail(400, 'json', 'Некорректный JSON.')
  }
  return object(parsed)
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'validation', 'Ожидается объект JSON.')
  return value as Record<string, unknown>
}

export function string(value: unknown, maximum: number, label: string, required = true): string {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) {
    return fail(400, 'validation', `Некорректное поле «${label}».`)
  }
  return value.trim()
}

export function id(value: unknown, label = 'идентификатор'): string {
  const candidate = string(value, 96, label)
  if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(candidate)) return fail(400, 'validation', `Некорректное поле «${label}».`)
  return candidate
}

export function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    return fail(400, 'validation', `Некорректное поле «${label}».`)
  }
  return value
}

export function clientAddress(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown'
}
