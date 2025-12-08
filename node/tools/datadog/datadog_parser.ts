import { DatadogOptions, LogBody, LogType } from './types'

export function datadogLog(params: {
  ctx: Context
  textReference: string
  content: unknown
  type: LogType
  options?: DatadogOptions
}): LogBody {
  const { ctx, textReference, content, type, options } = params
  const routeId =
    ctx.vtex?.route?.id ??
    ctx.vtex?.operationId ??
    (ctx as any)?.requestId ??
    'unknown'
  const account = ctx.vtex?.account ?? (ctx as any)?.account ?? 'unknown'
  const operationId =
    ctx.vtex?.operationId ?? (ctx as any)?.requestId ?? 'unknown'
  const appId = process.env.VTEX_APP_ID ?? 'unknown-app'
  const workspace =
    process.env.VTEX_WORKSPACE ??
    ctx.vtex?.workspace ??
    (ctx as any)?.workspace ??
    'unknown'

  const metadata = options?.metadata ?? {}
  const flow = metadata.flow as string | undefined
  const action = metadata.action as string | undefined

  const tags = [
    `env:${workspace}`,
    `service:${appId.split('@')[0]}`,
    `status:${type.toLowerCase()}`,
    `account:${account}`,
  ]

  if (flow) tags.push(`flow:${flow}`)
  if (action) tags.push(`action:${action}`)

  return {
    ddsource: 'vtex-io',
    ddtags: tags.join(','),
    hostname: account,
    service: appId.split('@')[0],
    message: textReference,
    status: type.toLowerCase(),
    timestamp: new Date().toISOString(),
    trace_id: options?.trackerId ?? routeId,
    env: workspace,
    version: process.env.VTEX_APP_VERSION ?? '',
    operationId,
    account,
    content: {
      ...metadata,
      ...(typeof content === 'object' && content !== null ? content : { data: content }),
    },
  }
}
