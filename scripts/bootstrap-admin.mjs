import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encryptTotp, hashPassword, makeTotpSecret, totpUri, validKey } from '../worker/crypto.ts'

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback
}

const slug = argument('--store', 'lumo')
const email = argument('--email').trim().toLowerCase()
const database = argument('--database', 'lumo-builder')
const config = argument('--config', 'wrangler.jsonc')
const local = process.argv.includes('--local')
const remote = process.argv.includes('--remote')
const persist = argument('--persist-to')
const { ADMIN_TOTP_KEY: totpKey, ADMIN_PASSWORD_KEY: passwordKey } = process.env

if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(slug) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  || email.length > 254 || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(database)
  || !validKey(totpKey) || !validKey(passwordKey) || local === remote || process.stdin.isTTY
) {
  console.error('Specify --email and exactly one of --local/--remote, provide password on stdin and independent keys as configured secrets.')
  process.exit(1)
}

const chunks = []
let size = 0
for await (const chunk of process.stdin) {
  size += chunk.length
  if (size > 1024) throw new Error('Password input exceeds length limit')
  chunks.push(chunk)
}
const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
if (password.length < 18 || password.length > 256) {
  console.error('Choose a unique password of 18–256 characters.')
  process.exit(1)
}

const id = crypto.randomUUID()
const secret = makeTotpSecret()
const hash = await hashPassword(password, passwordKey)
const ciphertext = await encryptTotp(secret, totpKey, `${slug}:${id}`)
const quote = input => `'${input.replaceAll("'", "''")}'`
const dir = mkdtempSync(join(tmpdir(), 'lumo-admin-'))
const filename = join(dir, 'provision.sql')
const root = fileURLToPath(new URL('../', import.meta.url))
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url))
try {
  const fields = [slug, id, email, 'owner', hash, ciphertext].map(quote).join(',')
  writeFileSync(filename, `INSERT INTO users (store_id,id,email,role,password_hash,totp_enc) VALUES (${fields});\n`, { mode: 0o600 })
  const args = [wrangler, 'd1', 'execute', database, '--config', config, local ? '--local' : '--remote', '--file', filename]
  if (local && persist) args.push('--persist-to', persist)
  const subprocessEnvironment = { ...process.env }
  delete subprocessEnvironment.ADMIN_TOTP_KEY
  delete subprocessEnvironment.ADMIN_PASSWORD_KEY
  const command = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env: subprocessEnvironment })
  if (command.status !== 0) {
    console.error('Provisioning failed. Confirm database, applied migrations, unique email and store ID matching its slug.')
    process.exitCode = 1
  } else {
    console.log(`Пользователь ${email} добавлен. Установите ключ в приложении аутентификации и сохраните его в защищённом месте.`)
    console.log(totpUri(email, secret))
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
