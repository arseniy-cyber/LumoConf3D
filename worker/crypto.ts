const UTF8 = new TextEncoder()
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PASSWORD_ITERATIONS = 100_000

function bytesToUrl(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid key encoding')
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(normalized), symbol => symbol.charCodeAt(0))
}

function keyBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = urlToBytes(value)
  if (bytes.length < 32) throw new Error('Invalid key length')
  return bytes
}

export function validKey(value?: string): value is string {
  try {
    return !!value && keyBytes(value).length === 32
  } catch {
    return false
  }
}

export function randomToken(length = 32): string {
  return bytesToUrl(crypto.getRandomValues(new Uint8Array(length)))
}

export async function digest(value: string): Promise<string> {
  return bytesToUrl(new Uint8Array(await crypto.subtle.digest('SHA-256', UTF8.encode(value))))
}

export async function keyedDigest(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return bytesToUrl(new Uint8Array(await crypto.subtle.sign('HMAC', key, UTF8.encode(value))))
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index]
  return difference === 0
}

export async function secureEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(a), digest(b)])
  return equal(urlToBytes(left), urlToBytes(right))
}

async function derivePassword(password: string, pepper: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const input = await keyedDigest(pepper, `lumo-password-v1:${password}`)
  const key = await crypto.subtle.importKey('raw', UTF8.encode(input), 'PBKDF2', false, ['deriveBits'])
  const options = { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }
  return new Uint8Array(await crypto.subtle.deriveBits(options, key, 256))
}

export async function hashPassword(password: string, pepper: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const result = await derivePassword(password, pepper, salt)
  return `v1.${bytesToUrl(salt)}.${bytesToUrl(result)}`
}

export async function verifyPassword(password: string, pepper: string, hash?: string): Promise<boolean> {
  const [,salt,result] = (hash || 'v1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA').split('.')
  const candidate = await derivePassword(password, pepper, urlToBytes(salt))
  return equal(candidate, urlToBytes(result)) && !!hash
}

export function makeTotpSecret(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(value => BASE32[value & 31]).join('')
}

function decodeBase32(secret: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid TOTP secret')
  const result = new Uint8Array(secret.length * 5 / 8)
  let buffer = 0
  let bits = 0
  let offset = 0
  for (const symbol of secret) {
    buffer = (buffer << 5) | BASE32.indexOf(symbol)
    bits += 5
    if (bits < 8) continue
    bits -= 8
    result[offset++] = buffer >> bits
  }
  return result
}

async function aesKey(secret: string) {
  return crypto.subtle.importKey('raw', keyBytes(secret), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptTotp(secret: string, key: string, identity: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const options = { name: 'AES-GCM', iv, additionalData: UTF8.encode(identity) }
  const ciphertext = await crypto.subtle.encrypt(options, await aesKey(key), UTF8.encode(secret))
  return `v1.${bytesToUrl(iv)}.${bytesToUrl(new Uint8Array(ciphertext))}`
}

export async function decryptTotp(secret: string, key: string, identity: string): Promise<string> {
  const [,iv,ciphertext] = secret.split('.')
  const options = { name: 'AES-GCM', iv: urlToBytes(iv), additionalData: UTF8.encode(identity) }
  const plaintext = await crypto.subtle.decrypt(options, await aesKey(key), urlToBytes(ciphertext))
  return new TextDecoder().decode(plaintext)
}

export async function totpAt(secret: string, counter: number): Promise<string> {
  const message = new ArrayBuffer(8)
  new DataView(message).setBigUint64(0, BigInt(counter))
  const key = await crypto.subtle.importKey('raw', decodeBase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, message))
  const start = hash[hash.length - 1] & 0x0f
  const number = new DataView(hash.buffer).getUint32(start) & 0x7fffffff
  return String(number % 1_000_000).padStart(6, '0')
}

export async function verifyTotp(secret: string, code: string, previous: number): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null
  const current = Math.floor(Date.now() / 30_000)
  const counters = [current, current - 1, current + 1]
  const allCodes = await Promise.all(counters.map(counter => totpAt(secret, counter)))
  const matches = await Promise.all(allCodes.map(candidate => secureEqual(code, candidate)))
  const index = matches.findIndex((match, position) => match && counters[position] > previous)
  return index < 0 ? null : counters[index]
}

export function totpUri(email: string, secret: string): string {
  const issuer = 'LUMO PC BUILDER'
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`
}
