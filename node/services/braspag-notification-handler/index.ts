/* eslint-disable vtex/prefer-early-return */
import {
  BraspagNotification,
  BraspagChangeType,
  StoredBraspagPayment,
} from '../../types/braspag-notifications'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { NotificationHandler, NotificationContext } from '../notification/types'
import {
  BRASPAG_STATUS,
  VBASE_BUCKETS,
} from '../../constants/payment-constants'

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
      >(VBASE_BUCKETS.BRASPAG_PAYMENTS, paymentId, true)

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

    // Determine effective status and amount (fallback to Braspag query if missing)
    let effectiveStatus = status
    let effectiveAmount = amount

    this.logger.info('BRASPAG: Status before query', {
      paymentId,
      notificationStatus: status,
      notificationAmount: amount,
      storedStatus: storedPayment.status,
      storedAmount: storedPayment.amount,
      hasQueryClient: !!context.clients.braspag?.queryPixStatus,
    })

    if (
      (effectiveStatus === undefined || effectiveAmount === undefined) &&
      context.clients.braspag?.queryPixStatus
    ) {
      try {
        this.logger.info('BRASPAG: Querying Braspag for status and amount', {
          paymentId,
        })
        const tx = (await context.clients.braspag.queryPixStatus(
          paymentId
        )) as { Payment?: { Status?: number; Amount?: number } }

        if (effectiveStatus === undefined) {
          effectiveStatus = tx.Payment?.Status
        }

        if (effectiveAmount === undefined) {
          effectiveAmount = tx.Payment?.Amount
        }

        this.logger.info('BRASPAG: Data from query', {
          paymentId,
          queriedStatus: tx.Payment?.Status,
          queriedAmount: tx.Payment?.Amount,
          effectiveStatus,
          effectiveAmount,
          fullResponse: tx,
        })
      } catch (error) {
        this.logger.warn('BRASPAG: Failed to query status/amount', {
          paymentId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Update stored payment status
    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      status: effectiveStatus ?? storedPayment.status,
      lastUpdated: new Date().toISOString(),
      ...(effectiveAmount !== undefined && { amount: effectiveAmount }),
    }

    this.logger.info('BRASPAG: Updating payment in VBase', {
      paymentId,
      oldStatus: storedPayment.status,
      newStatus: updatedPayment.status,
      effectiveStatus,
      amount: updatedPayment.amount,
    })

    // Save with Braspag PaymentId key
    await context.clients.vbase.saveJSON(
      VBASE_BUCKETS.BRASPAG_PAYMENTS,
      paymentId,
      updatedPayment
    )

    // Also save with VTEX PaymentId key if available
    if (storedPayment.vtexPaymentId) {
      await context.clients.vbase.saveJSON(
        VBASE_BUCKETS.BRASPAG_PAYMENTS,
        storedPayment.vtexPaymentId,
        updatedPayment
      )
      this.logger.info('BRASPAG: Payment updated in VBase with both keys', {
        braspagPaymentId: paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        finalStatus: updatedPayment.status,
        amount: updatedPayment.amount,
      })
    } else {
      this.logger.info('BRASPAG: Payment updated in VBase', {
        paymentId,
        finalStatus: updatedPayment.status,
        amount: updatedPayment.amount,
      })
    }

    // Trigger VTEX retry callback to fetch current status (PPF async flow)
    if (storedPayment.callbackUrl && context.clients.retry?.ping) {
      try {
        this.logger.info('VTEX_RETRY: Pinging callbackUrl', {
          paymentId,
          callbackUrl: storedPayment.callbackUrl,
        })
        await context.clients.retry.ping(storedPayment.callbackUrl)
        this.logger.info('VTEX_RETRY: Callback ping sent', { paymentId })
      } catch (error) {
        this.logger.warn('VTEX_RETRY: Callback ping failed', {
          paymentId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Process for PAID status
    if (effectiveStatus === BRASPAG_STATUS.PAID) {
      this.logger.info('BRASPAG: Payment confirmed as PAID', {
        paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        amount: updatedPayment.amount,
      })
      await this.processPaymentPaid(notification, storedPayment)
    }
  }

  /**
   * Process split payment and send callback to VTEX when payment is confirmed
   */
  private async processPaymentPaid(
    notification: BraspagNotification,
    storedPayment: StoredBraspagPayment
  ): Promise<void> {
    const { PaymentId } = notification

    try {
      this.logger.info('BRASPAG: Processing paid PIX payment', {
        paymentId: PaymentId,
        merchantOrderId: storedPayment.merchantOrderId,
      })

      // No forwarding to store-services here to avoid notification loops.

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

  // Forwarding to store-services removed to avoid loops; notification is handled within this connector.

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
      VBASE_BUCKETS.BRASPAG_PAYMENTS,
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
      VBASE_BUCKETS.BRASPAG_PAYMENTS,
      paymentId,
      updatedPayment
    )
  }
}
