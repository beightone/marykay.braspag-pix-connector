export function health(ctx: Context, next: any) {
  const { logger } = ctx
  
  logger?.info('HEALTH_CHECK_REQUEST', {
    timestamp: new Date().toISOString(),
    workspace: ctx.vtex?.workspace
  })
  
  ctx.status = 200
  ctx.body = 'OK'
  
  logger?.info('HEALTH_CHECK_SUCCESS', {
    status: 200
  })

  return next()
}
