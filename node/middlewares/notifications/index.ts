import {
  NotificationService,
  NotificationContext,
} from '../../services/notification-service'
import { BraspagNotificationHandler } from '../../services/braspag-notification-handler'
import { ConsoleLogger } from '../../clients/braspag/logger'
import { BraspagNotification } from '../../types/braspag-notifications'

// Create logger instance for notification middleware
const logger = new ConsoleLogger()

// Create notification service with Braspag handler
const notificationService = new NotificationService(logger)

notificationService.addHandler(new BraspagNotificationHandler(logger))

export async function notifications(ctx: NotificationContext) {
  const body = ctx.request.body as BraspagNotification

  try {
    logger.info('Notification received', { body })

    // Validate notification payload
    if (!body || typeof body !== 'object') {
      logger.warn('Invalid notification payload received')
      ctx.status = 400
      ctx.body = { error: 'Invalid notification payload' }

      return
    }

    // Process notification using the service
    const result = await notificationService.processNotification(body, ctx)

    // Handle the result
    if (result.status === 200) {
      logger.info('Notification processed successfully', {
        paymentId: body.PaymentId,
        changeType: body.ChangeType,
      })
      ctx.status = 200
      ctx.body = { message: 'Notification processed successfully' }
    } else {
      logger.error('Failed to process notification', {
        message: result.message,
        paymentId: body.PaymentId,
      })
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
