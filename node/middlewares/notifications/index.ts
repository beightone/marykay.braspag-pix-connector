import { BraspagNotificationHandler } from '../../services/braspag-notification-handler'
import { Logger } from '../../tools/datadog/datadog'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { BraspagNotification } from '../../types/braspag-notifications'
import { NotificationService } from '../../services'
import { NotificationContext } from '../../services/notification/types'

export async function notifications(ctx: Context) {
  const datadogLogger = new Logger(ctx, ctx.clients.datadog)
  const logger = new DatadogLoggerAdapter(datadogLogger)
  const notificationService = new NotificationService(logger)

  notificationService.addHandler(new BraspagNotificationHandler(logger))

  const body = ctx.state.body as BraspagNotification

  if (!body || typeof body !== 'object') {
    logger.warn('Invalid notification payload received', {})
    ctx.status = 400
    ctx.body = { error: 'Invalid notification payload' }

    return
  }

  const notificationContext: NotificationContext = {
    status: ctx.status || 200,
    body: ctx.body,
    vtex: { account: ctx.vtex.account },
    clients: {
      vbase: {
        getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
          ctx.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
        saveJSON: async (bucket: string, key: string, data: unknown) => {
          await ctx.clients.vbase.saveJSON(bucket, key, data)
        },
      },
      retry: {
        ping: async (url: string) => {
          try {
            await ctx.clients.vtexGateway.pingRetryCallback(url)
          } catch (error) {
            logger.warn('VTEX_RETRY_PING_FAILED', {
              url,
              error: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        },
      },
      braspag: {
        queryPixStatus: (paymentId: string) =>
          ctx.clients.braspagQuery.getTransactionByPaymentId(paymentId),
      },
    },
    request: { body },
  }

  const result = await notificationService.processNotification(
    body,
    notificationContext
  )

  if (result.status === 200) {
    logger.info('Notification processed successfully', {
      paymentId: body.PaymentId,
      changeType: body.ChangeType,
    })
    ctx.status = 200
    ctx.body = { message: 'Notification processed successfully' }

    return
  }

  logger.error('Failed to process notification', new Error(result.message), {
    paymentId: body.PaymentId,
    data: result.data,
  })
  ctx.status = result.status
  ctx.body = { error: result.message, data: result.data }
}
