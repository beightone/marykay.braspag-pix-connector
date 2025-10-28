import { DatadogOptions, LogBody, LogType } from './types'

export function datadogLog(params: {
  ctx: Context
  textReference: string
  content: unknown
  type: LogType
  options?: DatadogOptions
}): LogBody {
  const { ctx, textReference, content, type, options } = params
  const routeId = ctx.vtex?.route?.id ?? ctx.vtex?.operationId ?? 'unknown'
  const account = ctx.vtex?.account ?? 'unknown'
  const operationId = ctx.vtex?.operationId ?? 'unknown'
  const appId = process.env.VTEX_APP_ID ?? 'unknown-app'

  return {
    trace_id: options?.trackerId ?? routeId,
    source: 'vtex',
    env: process.env.VTEX_WORKSPACE ?? '',
    version: process.env.VTEX_APP_VERSION ?? '',
    hostname: account,
    message: textReference,
    service: appId.split('@')[0],
    status: type,
    operationId,
    account,
    content,
    metadata: {
      ...options?.metadata,
    },
  }
}
