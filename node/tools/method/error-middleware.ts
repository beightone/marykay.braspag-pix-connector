export async function errorMiddleware(ctx: Context, next: any) {
  const { logger } = ctx

  try {
    await next()
  } catch (err) {
    logger.error('CAPTURED_ERROR', err)
    ctx.body = err
    ctx.status = (err as any).status ?? 404
    throw err
  }
}
