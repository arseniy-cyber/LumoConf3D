/// <reference path="./worker-configuration.d.ts" />

export type AppEnv = Env & {
  ADMIN_TOTP_KEY?: string
  ADMIN_PASSWORD_KEY?: string
  RATE_LIMIT_KEY?: string
  TURNSTILE_SECRET?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  TELEGRAM_STORE?: string
}
