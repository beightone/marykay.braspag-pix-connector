import { Logger } from '../clients/braspag/logger'

export interface NotificationContext {
  status: number
  body: unknown
  clients: {
    vbase: {
      getJSON: <T>(
        bucket: string,
        key: string,
        nullIfNotFound?: boolean
      ) => Promise<T | null>
      saveJSON: (bucket: string, key: string, data: unknown) => Promise<void>
    }
  }
  request: {
    body: unknown
  }
}

export interface NotificationHandler {
  canHandle(notification: unknown): boolean
  handle(notification: unknown, context: NotificationContext): Promise<void>
}

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

  constructor(private logger: Logger) {}

  public addHandler(handler: NotificationHandler): void {
    this.handlers.push(handler)
  }

  public async processNotification(
    notification: unknown,
    context: NotificationContext
  ): Promise<NotificationResponse> {
    try {
      this.logger.info('NOTIFICATION: Received notification', {
        type: typeof notification,
        hasBody: !!notification,
      })

      // Find appropriate handler
      const handler = this.handlers.find(h => h.canHandle(notification))

      if (!handler) {
        this.logger.warn('NOTIFICATION: No handler found for notification', {
          notification,
        })

        return NotificationResponse.badRequest('Unsupported notification type')
      }

      // Process notification
      await handler.handle(notification, context)

      this.logger.info('NOTIFICATION: Successfully processed')

      return NotificationResponse.success()
    } catch (error) {
      this.logger.error('NOTIFICATION: Processing failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        notification,
      })

      return NotificationResponse.error(
        'Failed to process notification',
        error instanceof Error ? { message: error.message } : undefined
      )
    }
  }
}
