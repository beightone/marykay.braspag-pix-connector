import { json } from 'co-body'

export async function parseBody(ctx: Context, next: NextMiddleware) {
  const { req: body } = ctx

  const parsedBody = await json(body)

  ctx.state.body = parsedBody

  await next()
}
