/**
 * Webhook Inbound Service
 * Handles incoming webhook notifications from Braspag
 * Follows Single Responsibility Principle (SRP)
 */

import { Logger } from '@vtex/api'

import { BraspagNotification } from '../../types/braspag-notifications'
import { BraspagNotificationHandler } from '../braspag-notification-handler'
import { NotificationService } from '../notification'
import {
  VBaseClient,
  WebhookInboundProvider,
  WebhookRequest,
  WebhookResponse,
} from './types'

/**
 * Service for processing inbound webhook notifications
 * Integrates with existing notification system
 */
export class WebhookInboundService implements WebhookInboundProvider {
  private readonly notificationService: NotificationService

  constructor(private readonly logger: Logger) {
    this.notificationService = new NotificationService(this.logger)
    this.notificationService.addHandler(
      new BraspagNotificationHandler(this.logger)
    )
  }

  /**
   * Process incoming webhook notification
   */
  public async processWebhook(
    request: WebhookRequest,
    vbaseClient: VBaseClient
  ): Promise<WebhookResponse> {
    this.logger.info(
      `WEBHOOK: Processing inbound notification - ${JSON.stringify({
        body: request.body,
        headers: request.headers,
      })}`
    )

    try {
      const notification = request.body as BraspagNotification

      // Validate notification payload
      const validationResult = this.validateNotification(notification)

      if (!validationResult.isValid) {
        this.logger.warn(
          `WEBHOOK: Invalid notification payload - ${JSON.stringify({
            reason: validationResult.reason,
            notification,
          })}`
        )

        return {
          status: 400,
          body: { error: validationResult.reason },
        }
      }

      // Create notification context
      const notificationContext = {
        status: 200,
        body: {},
        clients: {
          vbase: vbaseClient,
        },
        request: {
          body: notification,
        },
      }

      // Process notification using existing service
      const result = await this.notificationService.processNotification(
        notification,
        notificationContext
      )

      // Handle the result
      if (result.status === 200) {
        this.logger.info(
          `WEBHOOK: Notification processed successfully - ${JSON.stringify({
            paymentId: notification.PaymentId,
            changeType: notification.ChangeType,
          })}`
        )

        return {
          status: 200,
          body: { message: 'Notification processed successfully' },
        }
      }

      this.logger.error(
        `WEBHOOK: Failed to process notification - ${JSON.stringify({
          message: result.message,
          paymentId: notification.PaymentId,
        })}`
      )

      return {
        status: result.status,
        body: {
          error: result.message,
          data: result.data,
        },
      }
    } catch (error) {
      this.logger.error(
        `WEBHOOK: Unexpected error processing notification - ${JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
        })}`
      )

      return {
        status: 500,
        body: {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      }
    }
  }

  /**
   * Validate incoming notification payload
   */
  private validateNotification(
    notification: unknown
  ): { isValid: boolean; reason?: string } {
    if (!notification || typeof notification !== 'object') {
      return {
        isValid: false,
        reason: 'Invalid notification payload: not an object',
      }
    }

    const notificationObj = notification as Record<string, unknown>

    if (!notificationObj.PaymentId) {
      return {
        isValid: false,
        reason: 'Invalid notification payload: missing PaymentId',
      }
    }

    if (notificationObj.ChangeType === undefined) {
      return {
        isValid: false,
        reason: 'Invalid notification payload: missing ChangeType',
      }
    }

    return { isValid: true }
  }
}

/**
 * Factory for creating webhook inbound service instances
 */
export class WebhookInboundServiceFactory {
  /**
   * Create webhook inbound service instance
   */
  public static create(logger: Logger): WebhookInboundProvider {
    return new WebhookInboundService(logger)
  }
}
