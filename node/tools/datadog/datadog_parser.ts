import type { DatadogOptions, LogBody, LogType } from './types'

export function datadogLog(
  ctx: Context,
  textReference: string,
  content: any,
  type: LogType,
  options?: DatadogOptions
): LogBody {
  return {
    trace_id: options?.trackerId ?? ctx.vtex.route.id,
    source: 'vtex',
    env: process.env.VTEX_WORKSPACE ?? '',
    version: process.env.VTEX_APP_VERSION ?? '',
    hostname: `${ctx.vtex.account}`,
    message: textReference,
    service: `${(process.env.VTEX_APP_ID as string).split('@')[0]}`,
    status: type,
    operationId: ctx.vtex.operationId,
    account: `${ctx.vtex.account}`,
    content,
    metadata: {
      ...options?.metadata,
    },
  }
}
