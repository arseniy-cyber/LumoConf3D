import { handleApi } from '../../worker/api'
import type { AppEnv } from '../../worker/environment'

export const onRequest: PagesFunction<AppEnv> = context =>
  handleApi(context.request, context.env, work => context.waitUntil(work))
