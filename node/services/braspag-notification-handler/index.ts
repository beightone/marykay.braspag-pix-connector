import {
  BraspagNotification,
  BraspagChangeType,
  StoredBraspagPayment,
} from '../../types/braspag-notifications'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { NotificationHandler, NotificationContext } from '../notification/types'
import { BRASPAG_STATUS } from '../../constants/payment-constants'

export class BraspagNotificationHandler implements NotificationHandler {
  constructor(private logger: DatadogLoggerAdapter) {}

  public canHandle(notification: unknown): notification is BraspagNotification {
    const canHandle = this.isBraspagNotification(notification)

    return canHandle
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

    const storedPayment = await this.getStoredPayment(PaymentId, context)

    if (!storedPayment) {
      this.logger.warn('BRASPAG: Payment not found in storage', { PaymentId })

      throw new Error(`Payment ${PaymentId} not found in storage`)
    }

    await this.processChangeType(notification, storedPayment, context)
  }

  // private getChangeTypeName(changeType: number): string {
  //   switch (changeType) {
  //     case BraspagChangeType.PaymentStatusChange:
  //       return 'PaymentStatusChange'

  //     case BraspagChangeType.FraudAnalysisChange:
  //       return 'FraudAnalysisChange'

  //     case BraspagChangeType.Chargeback:
  //       return 'Chargeback'

  //     default:
  //       return `Unknown(${changeType})`
  //   }
  // }

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
      const storedPayment = await context.clients.vbase.getJSON<
        StoredBraspagPayment
      >('braspag-payments', paymentId, true)

      return storedPayment
    } catch (error) {
      this.logger.error('BRASPAG: Failed to retrieve stored payment', error, {
        paymentId,
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
          notification,
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
    notification: BraspagNotification
  }): Promise<void> {
    const {
      paymentId,
      status,
      amount,
      storedPayment,
      context,
      notification,
    } = params

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

    // Process split payment and callback for PAID status
    if (status === BRASPAG_STATUS.PAID) {
      await this.processPaymentPaid(notification, storedPayment, context)
    }
  }

  /**
   * Process split payment and send callback to VTEX when payment is confirmed
   */
  private async processPaymentPaid(
    notification: BraspagNotification,
    storedPayment: StoredBraspagPayment,
    context: NotificationContext
  ): Promise<void> {
    const { PaymentId } = notification

    try {
      this.logger.info('BRASPAG: Processing paid PIX payment', {
        paymentId: PaymentId,
        merchantOrderId: storedPayment.merchantOrderId,
      })

      await this.forwardToStoreServices(notification, context)

      this.logger.info('BRASPAG: PIX payment processing completed', {
        paymentId: PaymentId,
        merchantOrderId: storedPayment.merchantOrderId,
        splitNote: 'Split automatically processed by Braspag during payment',
      })
    } catch (error) {
      this.logger.error('BRASPAG: Failed to process paid PIX payment', error, {
        paymentId: PaymentId,
        merchantOrderId: storedPayment.merchantOrderId,
      })
    }
  }

  /**
   * Forward notification to store-services for split processing
   */
  private async forwardToStoreServices(
    notification: BraspagNotification,
    context: NotificationContext
  ): Promise<void> {
    if (!context.clients.storeServices) {
      this.logger.warn('BRASPAG: Store Services client not available', {
        paymentId: notification.PaymentId,
      })

      return
    }

    try {
      this.logger.info('BRASPAG: Forwarding notification to store-services', {
        paymentId: notification.PaymentId,
        changeType: notification.ChangeType,
        status: notification.Status,
      })

      await context.clients.storeServices.forwardBraspagNotification(
        notification
      )

      this.logger.info('BRASPAG: Successfully forwarded to store-services', {
        paymentId: notification.PaymentId,
      })
    } catch (error) {
      this.logger.error('BRASPAG: Failed to forward to store-services', error, {
        paymentId: notification.PaymentId,
        notification,
      })

      throw error
    }
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

    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      lastUpdated: new Date().toISOString(),
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

    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      status,
      lastUpdated: new Date().toISOString(),
    }

    await context.clients.vbase.saveJSON(
      'braspag-payments',
      paymentId,
      updatedPayment
    )
  }
}
