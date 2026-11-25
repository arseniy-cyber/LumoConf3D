import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { encryptTotp, hashPassword, makeTotpSecret, totpAt } from '../worker/crypto.ts'
import { catalog, presets } from '../src/shared/catalog.ts'

// Wrangler pins the local workerd emulator and TypeScript bundler used here.
const requireWrangler = createRequire(createRequire(import.meta.url).resolve('wrangler/package.json'))
const { build } = requireWrangler('esbuild')
const { Miniflare, convertV4MiniflareOptions, Response: LocalResponse } = requireWrangler('miniflare')

function statements(sql) {
  const pieces = []
  let current = ''
  for (const line of sql.split('\n')) {
    if (!line.trim() || line.startsWith('--')) continue
    current += `${line}\n`
    if (!line.endsWith(';') || current.startsWith('CREATE TRIGGER') && !line.endsWith('END;')) continue
    pieces.push(current.trim())
    current = ''
  }
  assert.equal(current, '', 'all migration statements found')
  return pieces
}

test('LUMO API on workerd and a fresh D1 database', async t => {
  const key = () => randomBytes(32).toString('base64url')
  const passwordKey = key()
  const totpKey = key()
  const localOwnerEmail = 'owner@example.invalid'
  const origin = 'https://lumo.example'
  const idempotency = randomUUID()
  const usedTokens = new Set()
  let telegramMessage
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL('../worker/index.ts', import.meta.url))],
    write: false, platform: 'browser', format: 'esm', bundle: true, target: 'es2023',
  })
  const emulator = new Miniflare(convertV4MiniflareOptions({
    enableDevRegistry: false,
    cf: false,
    modules: [{ type: 'ESModule', path: 'index.mjs', contents: outputFiles[0].text }],
    compatibilityDate: '2026-11-25',
    bindings: {
      DEFAULT_STORE: 'lumo',
      RATE_LIMIT_KEY: key(),
      ADMIN_PASSWORD_KEY: passwordKey,
      ADMIN_TOTP_KEY: totpKey,
      TURNSTILE_SECRET: 'local-test-placeholder',
      TURNSTILE_SITE_KEY: 'local-test-placeholder',
      TURNSTILE_HOSTNAMES: 'lumo.example',
      TELEGRAM_BOT_TOKEN: '1:local-test-placeholder',
      TELEGRAM_CHAT_ID: '123456',
      TELEGRAM_STORE: 'lumo',
    },
    d1Databases: { DB: 'api-test' },
    async outboundService(request) {
      const url = new URL(request.url)
      if (url.origin === 'https://api.telegram.org' && url.pathname.endsWith('/sendMessage')) {
        telegramMessage = await request.json()
        return LocalResponse.json({ ok: true })
      }
      assert.equal(url.href, 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      const token = new URLSearchParams(await request.text()).get('response')
      // Simulate both canonical failures and successful replies.
      if (token === 'bad' || usedTokens.has(token)) return LocalResponse.json({ success: false })
      if (token === 'wrong-host') return LocalResponse.json({ success: true, action: 'quote_order', hostname: 'wrong.example' })
      if (token === 'wrong-action') return LocalResponse.json({ success: true, action: 'not_an_order', hostname: 'lumo.example' })
      usedTokens.add(token)
      return LocalResponse.json({ success: true, action: 'quote_order', hostname: 'lumo.example' })
    },
  }))
  t.after(() => emulator.dispose())
  const db = await emulator.getD1Database('DB')
  for (const file of ['0001_initial.sql', '0002_catalog.sql', '0003_catalog_assets.sql']) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8')
    await db.batch(statements(sql).map(statement => db.prepare(statement)))
  }
  await db.prepare("INSERT INTO stores (id,slug,name,license_status) VALUES ('other','other','Другой магазин','active')").run()
  await db.prepare("INSERT INTO store_hosts (hostname,store_id) VALUES ('other.example','other')").run()
  const owner = { id: randomUUID(), role: 'owner', email: localOwnerEmail }
  const password = `qa-${randomUUID()}`
  const secret = makeTotpSecret()
  const encrypted = await encryptTotp(secret, totpKey, `lumo:${owner.id}`)
  const passwordHash = await hashPassword(password, passwordKey)
  await db.prepare("INSERT INTO users (store_id,id,email,role,password_hash,totp_enc) VALUES ('lumo',?,?,?,?,?)")
    .bind(owner.id, owner.email, owner.role, passwordHash, encrypted).run()

  const request = async (path, method = 'GET', body, headers = {}, inspectOrigin = origin) => {
    const response = await emulator.dispatchFetch(`${inspectOrigin}${path}`, {
      method,
      headers: { 'CF-Connecting-IP': '203.0.113.12', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body instanceof Uint8Array ? body : body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : undefined
    return { status: response.status, payload, headers: response.headers, response }
  }

  const preset = presets.find(item => Object.keys(item.build).length === 9)
  assert.ok(preset)
  const buildParts = preset.build
  const smallQuote = { parts: { case: buildParts.case }, services: ['assembly'] }
  const part = catalog.find(part => part.id === buildParts.case)
  assert.ok(part)
  let csrfToken
  let cookie
  let auth
  let sharedBuild
  let testOrder
  let mediaUrl
  const prepareOrder = (token, expectedTotal) => ({
    parts: buildParts, customer: { name: 'Покупатель', email: 'customer@example.invalid' },
    services: ['assembly'], promoCode: 'QA10', expectedTotal, turnstileToken: token, total: 1,
  })

  await t.test('catalog seed, sizes, part fields and presets', async () => {
    const result = await request('/api/catalog')
    assert.equal(result.status, 200, JSON.stringify(result.payload))
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff')
    assert.ok(result.headers.get('strict-transport-security'))
    assert.equal(result.payload.products.length, 58)
    assert.equal(result.payload.nextOffset, null)
    for (const seeded of result.payload.products) {
      const local = catalog.find(item => item.id === seeded.id)
      assert.equal(seeded.modelUrl, local?.modelUrl)
      assert.equal(seeded.image, local?.image)
    }
    assert.equal((await request('/api/catalog?category=gpu')).payload.products.length, 10)
    assert.equal((await request('/api/presets')).payload.presets.length, presets.length)
    assert.equal((await request('/api/store')).payload.store.checkoutEnabled, true)
  })

  await t.test('server independently calculates price and rejects unknown categories/locations', async () => {
    const result = await request('/api/quote', 'POST', { ...smallQuote, total: 1 })
    assert.equal(result.status, 200, JSON.stringify(result.payload))
    assert.equal(result.payload.pricing.total, part.price + 4500)
    assert.equal(result.payload.pricing.hasDemoPrices, true)
    assert.equal((await request('/api/quote', 'POST', { parts: { part: part.id } })).payload.error.code, 'build_category')
    assert.equal((await request('/api/quote', 'POST', { ...smallQuote, options: { fanLocation: 'outside' } })).payload.error.code, 'mount_location')
  })

  await t.test('tenant host resolution, isolated catalog, and input/cross-origin defense', async () => {
    assert.deepEqual((await request('/api/catalog', 'GET', undefined, {}, 'https://other.example')).payload.products, [])
    assert.equal((await request('/api/quote?store=other', 'POST', smallQuote)).payload.error.code, 'part_missing')
    assert.equal((await request('/api/catalog?store=lumo%27')).status, 400)
    assert.equal((await request('/api/catalog', 'GET', undefined, { Origin: 'https://unknown.example' })).status, 403)
  })

  await t.test('build save and lookup scope public IDs to the storefront', async () => {
    const saved = await request('/api/builds', 'POST', { build: smallQuote.parts, name: 'Проверка' })
    assert.equal(saved.status, 201, JSON.stringify(saved.payload))
    sharedBuild = saved.payload.id
    assert.deepEqual((await request(`/api/builds/${sharedBuild}`)).payload, { build: smallQuote.parts, name: 'Проверка' })
    assert.equal((await request(`/api/builds/${sharedBuild}?store=other`)).status, 404)
  })

  await t.test('administrative endpoints require credentials and correct origin', async () => {
    assert.equal((await request('/api/admin/stats')).status, 401)
    const forbidden = await request('/api/admin/login', 'POST', { email: owner.email, password, code: '000000' }, { Origin: 'https://unknown.example' })
    assert.equal(forbidden.status, 403)
    assert.equal(forbidden.headers.get('access-control-allow-origin'), null)
  })

  await t.test('2FA login, protected cookie, TOTP replay, and session bound to store', async () => {
    const current = Math.floor(Date.now() / 30_000)
    const code = await totpAt(secret, current)
    const form = { email: owner.email, password, code }
    const authenticated = await request('/api/admin/login', 'POST', form, { Origin: origin })
    assert.equal(authenticated.status, 200, JSON.stringify(authenticated.payload))
    csrfToken = authenticated.payload.csrfToken
    assert.equal(authenticated.payload.user.role, 'owner')
    const setCookie = authenticated.headers.get('set-cookie')
    assert.match(setCookie, /^__Host-lumo-session=/)
    assert.match(setCookie, /HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/)
    cookie = setCookie.split(';')[0]
    auth = { Cookie: cookie, 'X-CSRF-Token': csrfToken, Origin: origin }
    assert.equal((await request('/api/admin/session', 'GET', undefined, { Cookie: cookie })).status, 200)
    assert.equal((await request('/api/admin/session?store=other', 'GET', undefined, { Cookie: cookie })).status, 401)
    assert.equal((await request('/api/admin/login', 'POST', form, { Origin: origin })).status, 401)
  })

  await t.test('CSRF required, store settings update, approved CORS, and promo discount', async () => {
    const settings = { name: 'LUMO QA', promotions: [{ code: 'QA10', percent: 10, active: true }], apiOrigins: ['https://embed.example'], telegramEnabled: true }
    assert.equal((await request('/api/admin/settings', 'PUT', { settings }, { Origin: origin, Cookie: cookie })).status, 403)
    assert.equal((await request('/api/admin/settings', 'PUT', { settings }, auth)).status, 200)
    const allow = await request('/api/catalog', 'GET', undefined, { Origin: 'https://embed.example' })
    assert.equal(allow.headers.get('access-control-allow-origin'), 'https://embed.example')
    assert.equal((await request('/api/admin/stats', 'GET', undefined, { Origin: 'https://embed.example', Cookie: cookie })).status, 403)
    const { pricing } = (await request('/api/quote', 'POST', { ...smallQuote, promoCode: 'qa10' })).payload
    assert.equal(pricing.total, part.price + 4500 - Math.floor(part.price * .1))
  })

  await t.test('upload validation, D1 binary round-trip and tenant isolation', async () => {
    const bad = await request('/api/admin/media', 'POST', Uint8Array.of(60, 115, 118, 103, 62), { ...auth, 'Content-Type': 'image/png' })
    assert.equal(bad.status, 422)
    const svg = await request('/api/admin/media', 'POST', Uint8Array.of(60, 115, 118, 103, 62), { ...auth, 'Content-Type': 'image/svg+xml' })
    assert.equal(svg.status, 415)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WfoYV0AAAAASUVORK5CYII=', 'base64')
    const upload = await request('/api/admin/media', 'POST', png, { ...auth, 'Content-Type': 'image/png' })
    assert.equal(upload.status, 201, JSON.stringify(upload.payload))
    mediaUrl = upload.payload.url
    const download = await request(mediaUrl)
    assert.equal(download.status, 200)
    assert.equal(download.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await download.response.arrayBuffer()), png)
    assert.equal((await request(mediaUrl.replace('store=lumo', 'store=other'))).status, 404)
  })

  await t.test('real Meshopt GLB round-trip; malformed GLB and known external reference rejected', async () => {
    const bytes = await readFile(new URL('../public/models/asus-dual-rtx4070-super-oc.glb', import.meta.url))
    const glb = { ...auth, 'Content-Type': 'model/gltf-binary' }
    const upload = await request('/api/admin/media', 'POST', bytes, glb)
    assert.equal(upload.status, 201, JSON.stringify(upload.payload))
    const download = await request(upload.payload.url)
    assert.equal(download.headers.get('content-type'), 'model/gltf-binary')
    assert.deepEqual(Buffer.from(await download.response.arrayBuffer()), bytes)
    const shortened = bytes.subarray(0, 100)
    assert.equal((await request('/api/admin/media', 'POST', shortened, glb)).status, 422)
    const documentLength = bytes.readUInt32LE(12)
    const document = JSON.parse(bytes.subarray(20, documentLength + 20))
    document.buffers[0].uri = 'https://external.invalid/model.bin'
    const raw = JSON.stringify(document)
    const replacement = Buffer.from(raw.padEnd(Math.ceil(raw.length / 4) * 4, ' '))
    const descriptor = Buffer.from(bytes.subarray(0, 20))
    descriptor.writeUInt32LE(bytes.length - documentLength + replacement.length, 8)
    descriptor.writeUInt32LE(replacement.length, 12)
    const unsafe = Buffer.concat([descriptor, replacement, bytes.subarray(20 + documentLength)])
    assert.equal((await request('/api/admin/media', 'POST', unsafe, glb)).status, 422)
  })

  await t.test('server product CRUD, media references, atomic bulk validation, archive and restore', async () => {
    const product = { ...part, image: mediaUrl, price: part.price + 50, specs: { ...part.specs, mountOffsetMm: { x: 0, y: 2, z: -5 }, mountRotationDeg: 0 } }
    assert.equal((await request(`/api/admin/products/${part.id}`, 'PUT', { product }, auth)).status, 200)
    const missing = { ...product, id: 'missing-pic', image: '/api/media/nonexistent?store=lumo' }
    assert.equal((await request('/api/admin/products', 'PUT', { products: [product, missing] }, auth)).status, 400)
    assert.equal((await request(`/api/admin/products/${part.id}`, 'DELETE', undefined, auth)).status, 200)
    assert.equal((await request('/api/quote', 'POST', smallQuote)).payload.error.code, 'part_missing')
    assert.equal((await request('/api/admin/products')).status, 401)
    const archived = (await request('/api/admin/products', 'GET', undefined, auth)).payload.archivedIds
    assert.ok(archived.includes(part.id))
    assert.equal((await request(`/api/admin/products/${part.id}`, 'PUT', { product: part }, auth)).status, 200)
  })

  await t.test('compatibility and explicit price confirmation enforced on orders', async () => {
    const badCpu = catalog.find(item => item.category === 'cpu' && item.specs.socket === 'AM4')
    assert.ok(badCpu)
    const incompatible = await request('/api/orders', 'POST', { ...prepareOrder('unused'), parts: { ...buildParts, cpu: badCpu.id } })
    assert.equal(incompatible.status, 422, JSON.stringify(incompatible.payload))
    assert.equal(incompatible.payload.error.code, 'compatibility')
    const conflicts = await request('/api/orders', 'POST', prepareOrder('unused', 1))
    assert.equal(conflicts.status, 409, JSON.stringify(conflicts.payload))
    assert.equal(conflicts.payload.error.code, 'quote_changed')
    assert.equal(usedTokens.has('unused'), false)
  })

  await t.test('Turnstile server reply checked, total recomputed, key retries safe, no public order lookup', async () => {
    assert.equal((await request('/api/orders', 'POST', prepareOrder('bad'))).status, 403)
    assert.equal((await request('/api/orders', 'POST', prepareOrder('wrong-host'))).status, 403)
    assert.equal((await request('/api/orders', 'POST', prepareOrder('wrong-action'))).status, 403)
    const submitted = await request('/api/orders', 'POST', prepareOrder('ok-a'), { 'Idempotency-Key': idempotency })
    assert.equal(submitted.status, 201, JSON.stringify(submitted.payload))
    testOrder = submitted.payload.order
    assert.notEqual(testOrder.total, 1)
    const retry = await request('/api/orders', 'POST', prepareOrder('ok-a'), { 'Idempotency-Key': idempotency })
    assert.equal(retry.payload.order.id, testOrder.id)
    assert.equal((await request('/api/orders', 'POST', prepareOrder('ok-a'))).status, 403)
    assert.equal((await request(`/api/orders/${testOrder.id}`)).status, 404)
    const list = await request('/api/admin/orders', 'GET', undefined, auth)
    assert.equal(list.payload.orders.length, 1)
    assert.equal(list.payload.orders[0].id, testOrder.id)
    assert.equal(list.payload.orders[0].parts.length, Object.keys(buildParts).length)
    assert.equal(list.payload.orders[0].pricing.promoCode, 'QA10')
    assert.equal((await request(`/api/admin/orders/${testOrder.id}`, 'PATCH', { status: 'confirmed' }, auth)).status, 200)
    assert.equal((await request('/api/admin/stats', 'GET', undefined, auth)).payload.stats.total, testOrder.total)
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.match(telegramMessage?.text ?? '', new RegExp(testOrder.id))
    assert.doesNotMatch(telegramMessage.text, /customer@example/)
  })

  await t.test('rate limit blocks the ninth order submission in the same window', async () => {
    for (let index = 0; index < 8; index++) {
      const allowed = await request('/api/orders?store=other', 'POST', prepareOrder(`unused-${index}`))
      assert.equal(allowed.payload.error.code, 'part_missing')
    }
    const result = await request('/api/orders?store=other', 'POST', prepareOrder('rate-test'))
    assert.equal(result.status, 429, JSON.stringify(result.payload))
    assert.ok(result.headers.get('retry-after'))
    assert.equal(usedTokens.has('rate-test'), false)
  })

  await t.test('roles, account disable, and logout revocation', async () => {
    const email = 'support@example.invalid'
    const password = `qa-${randomUUID()}`
    const created = await request('/api/admin/users', 'POST', { email, password, role: 'support' }, auth)
    assert.equal(created.status, 201, JSON.stringify(created.payload))
    const code = await totpAt(created.payload.totpSecret, Math.floor(Date.now() / 30_000))
    const support = await request('/api/admin/login', 'POST', { email, password, code }, { Origin: origin })
    assert.equal(support.status, 200, JSON.stringify(support.payload))
    const supportCookie = support.headers.get('set-cookie').split(';')[0]
    assert.equal((await request('/api/admin/products', 'GET', undefined, { Cookie: supportCookie })).status, 403)
    assert.equal((await request('/api/admin/orders', 'GET', undefined, { Cookie: supportCookie })).status, 200)
    assert.equal((await request(`/api/admin/users/${created.payload.user.id}`, 'PATCH', { active: false }, auth)).status, 200)
    assert.equal((await request('/api/admin/orders', 'GET', undefined, { Cookie: supportCookie })).status, 401)
    assert.ok((await request('/api/admin/audit', 'GET', undefined, auth)).payload.entries.length >= 8)
    assert.equal((await request('/api/admin/logout', 'POST', undefined, auth)).status, 200)
    assert.equal((await request('/api/admin/session', 'GET', undefined, { Cookie: cookie })).status, 401)
  })
})
