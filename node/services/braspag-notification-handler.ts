import {
  BraspagNotification,
  BraspagChangeType,
  StoredBraspagPayment,
} from '../types/braspag-notifications'
import {
  NotificationHandler,
  NotificationContext,
} from './notification-service'
import { Logger } from '../clients/braspag/logger'

export class BraspagNotificationHandler implements NotificationHandler {
  constructor(private logger: Logger) {}

  public canHandle(notification: unknown): notification is BraspagNotification {
    return this.isBraspagNotification(notification)
  }

  public async handle(
    notification: BraspagNotification,
    context: NotificationContext
  ): Promise<void> {
    const { PaymentId, ChangeType, Status, MerchantOrderId } = notification

    if (!PaymentId || ChangeType === undefined) {
      throw new Error('Invalid Braspag notification: missing required fields')
    }

    this.logger.info('BRASPAG: Processing notification', {
      PaymentId,
      ChangeType,
      Status,
      MerchantOrderId,
    })

    // Find the corresponding stored payment
    const storedPayment = await this.getStoredPayment(PaymentId, context)

    if (!storedPayment) {
      this.logger.warn('BRASPAG: Payment not found in storage', { PaymentId })
      throw new Error(`Payment ${PaymentId} not found in storage`)
    }

    await this.processChangeType(notification, storedPayment, context)
  }

  private isBraspagNotification(
    notification: unknown
  ): notification is BraspagNotification {
    return (
      notification !== null &&
      typeof notification === 'object' &&
      'PaymentId' in notification &&
      'ChangeType' in notification &&
      typeof (notification as BraspagNotification).PaymentId === 'string' &&
      typeof (notification as BraspagNotification).ChangeType === 'number'
    )
  }

  private async getStoredPayment(
    paymentId: string,
    context: NotificationContext
  ): Promise<StoredBraspagPayment | null> {
    try {
      return await context.clients.vbase.getJSON<StoredBraspagPayment>(
        'braspag-payments',
        paymentId,
        true
      )
    } catch (error) {
      this.logger.error('BRASPAG: Failed to retrieve stored payment', {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return null
    }
  }

  private async processChangeType(
    notification: BraspagNotification,
    storedPayment: StoredBraspagPayment,
    context: NotificationContext
  ): Promise<void> {
    const { PaymentId, ChangeType, Status, Amount } = notification

    switch (ChangeType) {
      case BraspagChangeType.PaymentStatusChange:
        await this.handlePaymentStatusChange({
          paymentId: PaymentId,
          status: Status,
          amount: Amount,
          storedPayment,
          context,
        })
        break

      case BraspagChangeType.FraudAnalysisChange:
        await this.handleFraudAnalysisChange({
          paymentId: PaymentId,
          status: Status,
          storedPayment,
          context,
        })
        break

      case BraspagChangeType.Chargeback:
        await this.handleChargeback({
          paymentId: PaymentId,
          status: Status,
          storedPayment,
          context,
        })
        break

      default:
        this.logger.warn('BRASPAG: Unknown change type', {
          PaymentId,
          ChangeType,
        })
        break
    }
  }

  private async handlePaymentStatusChange(params: {
    paymentId: string
    status: number | undefined
    amount: number | undefined
    storedPayment: StoredBraspagPayment
    context: NotificationContext
  }): Promise<void> {
    const { paymentId, status, amount, storedPayment, context } = params

    this.logger.info('BRASPAG: Payment status changed', {
      paymentId,
      oldStatus: storedPayment.status,
      newStatus: status,
      amount,
    })

    // Update stored payment status
    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      status,
      lastUpdated: new Date().toISOString(),
      ...(amount !== undefined && { amount }),
    }

    await context.clients.vbase.saveJSON(
      'braspag-payments',
      paymentId,
      updatedPayment
    )

    // TODO: Implement callback to VTEX if needed for status changes
    // This would typically involve calling the VTEX callback URL
    // to notify about payment status changes
  }

  private async handleFraudAnalysisChange(params: {
    paymentId: string
    status: number | undefined
    storedPayment: StoredBraspagPayment
    context: NotificationContext
  }): Promise<void> {
    const { paymentId, status, storedPayment, context } = params

    this.logger.info('BRASPAG: Fraud analysis changed', {
      paymentId,
      status,
    })

    // Update stored payment with fraud analysis information
    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      lastUpdated: new Date().toISOString(),
      // Add fraud analysis specific fields if needed
    }

    await context.clients.vbase.saveJSON(
      'braspag-payments',
      paymentId,
      updatedPayment
    )
  }

  private async handleChargeback(params: {
    paymentId: string
    status: number | undefined
    storedPayment: StoredBraspagPayment
    context: NotificationContext
  }): Promise<void> {
    const { paymentId, status, storedPayment, context } = params

    this.logger.info('BRASPAG: Chargeback notification', {
      paymentId,
      status,
    })

    // Update stored payment with chargeback information
    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      status,
      lastUpdated: new Date().toISOString(),
      // Add chargeback specific fields if needed
    }

    await context.clients.vbase.saveJSON(
      'braspag-payments',
      paymentId,
      updatedPayment
    )
  }
}
