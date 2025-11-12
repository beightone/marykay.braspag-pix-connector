import { UserInputError } from '@vtex/api'

export async function withAppSettings(
  ctx: Context,
  next: NextMiddleware
) {
  const {
    clients: { apps: appsClient },
  } = ctx

  const expectedSettings: Array<
    'merchantId' | 'merchantKey' | 'clientSecret'
  > = ['merchantId', 'merchantKey', 'clientSecret']

  const appSettings = await appsClient.getAppSettings(
    process.env.VTEX_APP_ID as string
  )

  for (const field of expectedSettings) {
    const setting = appSettings[field]

    if (!setting) {
      throw new UserInputError(
        `Missing field ${field} in app ${process.env.VTEX_APP_ID} settings`
      )
    }
  }

  ctx.vtex.settings = {
    ...ctx.vtex.settings,
    ...appSettings,
  }

  await next()
}


