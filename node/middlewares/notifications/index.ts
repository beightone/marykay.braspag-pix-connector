import { BraspagNotificationHandler } from '../../services/braspag-notification-handler'
import { Logger } from '../../tools/datadog/datadog'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { BraspagNotification } from '../../types/braspag-notifications'
import { NotificationService } from '../../services'
import { NotificationContext } from '../../services/notification/types'
import { StoreServicesClient } from '../../clients/store-services'

export async function notifications(ctx: Context) {
  const datadogLogger = new Logger(ctx, ctx.clients.datadog)
  const logger = new DatadogLoggerAdapter(datadogLogger)

  const notificationService = new NotificationService(datadogLogger)

  notificationService.addHandler(new BraspagNotificationHandler(logger))

  const body = ctx.state.body as BraspagNotification

  try {
    logger.info('Notification received', { body })

    if (!body || typeof body !== 'object') {
      logger.warn('Invalid notification payload received', {})
      ctx.status = 400
      ctx.body = { error: 'Invalid notification payload' }

      return
    }

    const storeServicesClient = new StoreServicesClient(ctx.vtex, {})

    const notificationContext: NotificationContext = {
      status: ctx.status || 200,
      body: ctx.body,
      clients: {
        vbase: {
          getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
            ctx.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
          saveJSON: async (bucket: string, key: string, data: unknown) => {
            await ctx.clients.vbase.saveJSON(bucket, key, data)
          },
        },
        storeServices: {
          forwardBraspagNotification: (notification: unknown) =>
            storeServicesClient.forwardBraspagNotification(notification),
        },
      },
      request: {
        body,
      },
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
    } else {
      logger.error(
        'Failed to process notification',
        new Error(result.message),
        {
          paymentId: body.PaymentId,
          data: result.data,
        }
      )

      ctx.status = result.status
      ctx.body = {
        error: result.message,
        data: result.data,
      }
    }
  } catch (error) {
    logger.error('Unexpected error processing notification', error)

    ctx.status = 500
    ctx.body = {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
