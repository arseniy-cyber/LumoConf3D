import {
  decryptTotp, digest, encryptTotp, hashPassword, makeTotpSecret, randomToken, secureEqual,
  totpUri, validKey, verifyPassword, verifyTotp,
} from './crypto'
import type { AppEnv } from './environment'
import { fail, isLoopback, json, readJson } from './http'
import { audit, limit, type Store } from './store'
import { parseEmail } from './validation'

export type Role = 'owner' | 'manager' | 'support'

interface UserRow {
  id: string
  email: string
  role: Role
  active: number
}

export interface Session {
  user: UserRow
  tokenHash: string
  csrfToken: string
}

interface AuthRow extends UserRow {
  password_hash: string
  totp_enc: string
  last_totp_counter: number
}

const MAX_AGE = 8 * 60 * 60

function cookieMode(request: Request) {
  const localHttp = new URL(request.url).protocol === 'http:' && isLoopback(new URL(request.url))
  return { name: localHttp ? 'lumo-local-session' : '__Host-lumo-session', secure: !localHttp }
}

function cookie(request: Request, value: string, age: number): string {
  const { name, secure } = cookieMode(request)
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? '; Secure' : ''}`
}

function readSessionToken(request: Request): string {
  const prefix = `${cookieMode(request).name}=`
  const item = request.headers.get('Cookie')?.split(';').map(entry => entry.trim()).find(entry => entry.startsWith(prefix))
  const value = item?.slice(prefix.length) ?? ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) fail(401, 'session', 'Войдите в панель управления.')
  return value
}

export function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, role: user.role, active: user.active === 1 }
}

export function requireRole(session: Session, ...roles: Role[]) {
  if (!roles.includes(session.user.role)) fail(403, 'role', 'Недостаточно прав для этого действия.')
}

export function requireSameOrigin(request: Request): void {
  const url = new URL(request.url)
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    fail(403, 'origin', 'Запрос должен исходить из панели управления.')
  }
}

export async function requireSession(request: Request, env: AppEnv, store: Store): Promise<Session> {
  const token = readSessionToken(request)
  const [tokenHash, csrfToken] = await Promise.all([digest(token), digest(`csrf-v1:${token}`)])
  const user = await env.DB.prepare(
    `SELECT users.id,users.email,users.role,users.active FROM sessions
     JOIN users ON users.store_id=sessions.store_id AND users.id=sessions.user_id
     WHERE sessions.store_id=? AND sessions.token_hash=? AND sessions.expires_at>unixepoch() AND users.active=1`,
  ).bind(store.id, tokenHash).first<UserRow>()
  if (!user) fail(401, 'session', 'Сессия истекла. Войдите снова.')
  return { user, tokenHash, csrfToken }
}

export async function requireCsrf(request: Request, session: Session): Promise<void> {
  requireSameOrigin(request)
  const token = request.headers.get('X-CSRF-Token') || ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !await secureEqual(token, session.csrfToken)) {
    fail(403, 'csrf', 'Сессия формы устарела. Обновите страницу.')
  }
}

export function sessionResponse(session: Session, headers?: HeadersInit): Response {
  return json({ user: publicUser(session.user), csrfToken: session.csrfToken }, 200, headers)
}

function loginError(): never {
  return fail(401, 'login', 'Проверьте адрес, пароль и код из приложения аутентификации.')
}

function credentialKeys(env: AppEnv): { totpKey: string; passwordKey: string } {
  const totpKey = env.ADMIN_TOTP_KEY
  const passwordKey = env.ADMIN_PASSWORD_KEY
  if (!validKey(totpKey) || !validKey(passwordKey)) {
    return fail(503, 'admin_setup', 'Панель управления ещё не настроена.')
  }
  return { totpKey, passwordKey }
}

function passwordInput(value: unknown, picking = false): string {
  if (typeof value !== 'string' || value.length > 256 || value.length < (picking ? 18 : 1)) {
    return fail(400, 'password', picking ? 'Придумайте пароль длиной от 18 до 256 символов.' : 'Укажите пароль.')
  }
  return value
}

export async function login(request: Request, env: AppEnv, store: Store): Promise<Response> {
  requireSameOrigin(request)
  await limit(env, store, request, 'login_ip', 18, 600, true)
  const { totpKey, passwordKey } = credentialKeys(env)
  const body = await readJson(request, 4 * 1024)
  const email = parseEmail(body.email, true)
  const password = passwordInput(body.password)
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!/^\d{6}$/.test(code)) loginError()
  await limit(env, store, request, 'login_account', 8, 600, true, email)
  const user = await env.DB.prepare(
    'SELECT id,email,role,active,password_hash,totp_enc,last_totp_counter FROM users WHERE store_id=? AND email=?',
  ).bind(store.id, email).first<AuthRow>()
  const passwordOk = await verifyPassword(password, passwordKey, user?.password_hash)
  if (!passwordOk || !user?.active) loginError()
  const secret = await decryptTotp(user.totp_enc, totpKey, `${store.id}:${user.id}`)
  const counter = await verifyTotp(secret, code, user.last_totp_counter)
  if (counter === null) loginError()
  const token = randomToken()
  const [tokenHash, csrfToken] = await Promise.all([digest(token), digest(`csrf-v1:${token}`)])
  const [,inserted] = await env.DB.batch([
    env.DB.prepare(
      'UPDATE users SET last_totp_counter=? WHERE store_id=? AND id=? AND active=1 AND last_totp_counter<?',
    ).bind(counter, store.id, user.id, counter),
    env.DB.prepare(
      'INSERT INTO sessions (store_id,user_id,token_hash,expires_at) SELECT ?,?,?,unixepoch()+? WHERE changes()=1',
    ).bind(store.id, user.id, tokenHash, MAX_AGE),
    env.DB.prepare(
      `INSERT INTO audit_log (store_id,user_id,action)
       SELECT ?,?, 'login' WHERE EXISTS (SELECT 1 FROM sessions WHERE store_id=? AND token_hash=?)`,
    ).bind(store.id, user.id, store.id, tokenHash),
  ])
  if (!inserted.meta.changes) loginError()
  return sessionResponse({ user, tokenHash, csrfToken }, { 'Set-Cookie': cookie(request, token, MAX_AGE) })
}

export async function logout(request: Request, env: AppEnv, store: Store, session: Session): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE store_id=? AND token_hash=?').bind(store.id, session.tokenHash),
    audit(env, store, session.user.id, 'logout'),
  ])
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) })
}

export async function prepareUser(
  storeId: string, email: string, password: string, role: Role, passwordKey: string, totpKey: string,
) {
  passwordInput(password, true)
  const user = { id: crypto.randomUUID(), email: parseEmail(email, true), role, active: 1 }
  const secret = makeTotpSecret()
  const [hash, encrypted] = await Promise.all([
    hashPassword(password, passwordKey), encryptTotp(secret, totpKey, `${storeId}:${user.id}`),
  ])
  return { user, hash, encrypted, secret, uri: totpUri(user.email, secret) }
}

function managedRole(value: unknown): 'manager' | 'support' {
  if (value !== 'manager' && value !== 'support') fail(400, 'role', 'Выберите роль менеджера или поддержки.')
  return value
}

export async function createUser(request: Request, env: AppEnv, store: Store, actor: Session): Promise<Response> {
  requireRole(actor, 'owner')
  const input = await readJson(request, 4 * 1024)
  const email = parseEmail(input.email, true)
  const role = managedRole(input.role)
  const password = passwordInput(input.password, true)
  const keys = credentialKeys(env)
  const { user, hash, encrypted, secret, uri } = await prepareUser(store.id, email, password, role, keys.passwordKey, keys.totpKey)
  const [inserted] = await env.DB.batch([
    env.DB.prepare(
      'INSERT OR IGNORE INTO users (store_id,id,email,role,password_hash,totp_enc) VALUES (?,?,?,?,?,?)',
    ).bind(store.id, user.id, user.email, user.role, hash, encrypted),
    env.DB.prepare(
      `INSERT INTO audit_log (store_id,user_id,action,target)
       SELECT ?,?, 'create_user', ? WHERE changes()=1`,
    ).bind(store.id, actor.user.id, user.id),
  ])
  if (!inserted.meta.changes) fail(409, 'duplicate_user', 'У этого магазина уже есть пользователь с таким адресом.')
  return json({ user: publicUser(user), totpSecret: secret, totpUri: uri }, 201)
}

export async function listUsers(env: AppEnv, store: Store, actor: Session): Promise<Response> {
  requireRole(actor, 'owner')
  const { results } = await env.DB.prepare('SELECT id,email,role,active FROM users WHERE store_id=? ORDER BY email LIMIT 1000')
    .bind(store.id).all<UserRow>()
  return json({ users: results.map(publicUser) })
}

export async function updateUser(request: Request, env: AppEnv, store: Store, actor: Session, targetId: string): Promise<Response> {
  requireRole(actor, 'owner')
  const target = await env.DB.prepare('SELECT id,email,role,active FROM users WHERE store_id=? AND id=?')
    .bind(store.id, targetId).first<UserRow>()
  if (!target) fail(404, 'user', 'Пользователь не найден.')
  if (target.role === 'owner') fail(403, 'owner_account', 'Учётная запись владельца управляется при настройке магазина.')
  const input = await readJson(request, 4 * 1024)
  const role = input.role === undefined ? target.role : managedRole(input.role)
  if (input.active !== undefined && typeof input.active !== 'boolean') fail(400, 'user_active', 'Проверьте статус пользователя.')
  const active = input.active === undefined ? target.active : Number(input.active)
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET role=?,active=? WHERE store_id=? AND id=?').bind(role, active, store.id, target.id),
    env.DB.prepare('DELETE FROM sessions WHERE store_id=? AND user_id=?').bind(store.id, target.id),
    audit(env, store, actor.user.id, 'update_user', target.id),
  ])
  return json({ user: publicUser({ ...target, role, active }) })
}
