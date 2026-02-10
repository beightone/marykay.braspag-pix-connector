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
    logger.warn('PIX.WEBHOOK.INVALID_PAYLOAD', {
      flow: 'webhook',
      action: 'invalid_payload',
      contentType: ctx.request?.headers?.['content-type'],
    })
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
            logger.warn('PIX.WEBHOOK.RETRY_PING_FAILED', {
              flow: 'webhook',
              action: 'retry_ping_failed',
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
    ctx.status = 200
    ctx.body = { message: 'Notification processed successfully' }

    return
  }

  logger.error('PIX.WEBHOOK.FAILED', new Error(result.message), {
    flow: 'webhook',
    action: 'processing_failed',
    paymentId: body.PaymentId,
    changeType: body.ChangeType,
    resultStatus: result.status,
  })
  ctx.status = result.status
  ctx.body = { error: result.message, data: result.data }
}
