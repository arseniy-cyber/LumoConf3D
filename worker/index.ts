import { handleApi } from './api'
import type { AppEnv } from './environment'
import { cleanup } from './store'

export default {
  fetch(request, env, context) {
    return handleApi(request, env, work => context.waitUntil(work))
  },
  async scheduled(_event, env) {
    await cleanup(env.DB)
  },
} satisfies ExportedHandler<AppEnv>
