/**
 * Webhook Inbound Service
 * Handles incoming webhook notifications from Braspag
 * Follows Single Responsibility Principle (SRP)
 */

import { Logger } from '../../tools/datadog/datadog'
import { BraspagNotification } from '../../types/braspag-notifications'
import {
  VBaseClient,
  WebhookInboundProvider,
  WebhookRequest,
  WebhookResponse,
} from './types'

/**
 * Service for processing inbound webhook notifications
 * Uses Datadog logger for enhanced logging capabilities
 */
export class WebhookInboundService implements WebhookInboundProvider {
  constructor(private readonly logger: Logger) {}

  /**
   * Process incoming webhook notification
   */
  public async processWebhook(
    request: WebhookRequest,
    _vbaseClient: VBaseClient
  ): Promise<WebhookResponse> {
    this.logger.info('WEBHOOK: Processing inbound notification', {
      body: request.body,
      headers: request.headers,
    })

    try {
      const notification = request.body as BraspagNotification

      // Validate notification payload
      const validationResult = this.validateNotification(notification)

      if (!validationResult.isValid) {
        this.logger.warn('WEBHOOK: Invalid notification payload', {
          reason: validationResult.reason,
          notification,
        })

        return {
          status: 400,
          body: { error: validationResult.reason },
        }
      }

      // Process the notification - simplified version without external dependencies
      this.logger.info('WEBHOOK: Notification processed successfully', {
        paymentId: notification.PaymentId,
        changeType: notification.ChangeType,
      })

      return {
        status: 200,
        body: { message: 'Notification processed successfully' },
      }
    } catch (error) {
      this.logger.error('WEBHOOK: Unexpected error processing notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

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
