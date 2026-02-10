import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'
import { NotificationHandler, NotificationContext } from './types'

export class NotificationResponse {
  constructor(
    public readonly status: number,
    public readonly message: string,
    public readonly data?: unknown
  ) {}

  public static success(
    message = 'Notification processed successfully'
  ): NotificationResponse {
    return new NotificationResponse(200, message)
  }

  public static badRequest(
    message = 'Invalid notification payload'
  ): NotificationResponse {
    return new NotificationResponse(400, message)
  }

  public static notFound(message = 'Resource not found'): NotificationResponse {
    return new NotificationResponse(404, message)
  }

  public static error(
    message = 'Internal server error',
    data?: unknown
  ): NotificationResponse {
    return new NotificationResponse(500, message, data)
  }
}

export class NotificationService {
  private handlers: NotificationHandler[] = []

  constructor(private logger: DatadogCompatibleLogger) {}

  public addHandler(handler: NotificationHandler): void {
    this.handlers.push(handler)
  }

  public async processNotification(
    notification: unknown,
    context: NotificationContext
  ): Promise<NotificationResponse> {
    try {
      const handler = this.handlers.find(h => h.canHandle(notification))

      if (!handler) {
        this.logger.warn('PIX.NOTIFY.NO_HANDLER', {
          flow: 'notification',
          action: 'no_handler_found',
          notificationType: typeof notification,
          hasPaymentId: !!(notification as any)?.PaymentId,
        })

        return NotificationResponse.badRequest('Unsupported notification type')
      }

      await handler.handle(notification, context)

      return NotificationResponse.success()
    } catch (error) {
      this.logger.error('PIX.NOTIFY.PROCESSING_FAILED', error, {
        flow: 'notification',
        action: 'processing_failed',
        paymentId: (notification as any)?.PaymentId,
        error: error instanceof Error ? error.message : String(error),
      })

      return NotificationResponse.error('Failed to process notification')
    }
  }
}
