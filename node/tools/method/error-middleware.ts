export async function errorMiddleware(ctx: Context, next: NextMiddleware) {
  const { logger } = ctx

  try {
    await next()
  } catch (err) {
    logger.error('CAPTURED_ERROR', err)
    ctx.body = {
      error: err instanceof Error ? err.message : 'Unknown error',
    }
    ctx.status = 500
    throw err
  }
}
