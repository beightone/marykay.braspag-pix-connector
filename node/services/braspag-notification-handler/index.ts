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
  PIX_TIMING,
} from '../../constants/payment-constants'

export class BraspagNotificationHandler implements NotificationHandler {
  constructor(private logger: DatadogLoggerAdapter) {}

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

    this.logger.info('PIX.NOTIFY.RECEIVED', {
      flow: 'notification',
      action: 'notification_received',
      paymentId: PaymentId,
      changeType: ChangeType,
      changeTypeName: this.getChangeTypeName(ChangeType),
      braspagStatus: Status,
      merchantOrderId: MerchantOrderId,
      notificationAmount: notification.Amount,
    })

    const storedPayment = await this.getStoredPayment(PaymentId, context)

    if (!storedPayment) {
      this.logger.warn('PIX.NOTIFY.PAYMENT_NOT_FOUND', {
        flow: 'notification',
        action: 'payment_not_found',
        paymentId: PaymentId,
        changeType: ChangeType,
      })

      throw new Error(`Payment ${PaymentId} not found in storage`)
    }

    await this.processChangeType(notification, storedPayment, context)
  }

  private getChangeTypeName(changeType: number): string {
    switch (changeType) {
      case BraspagChangeType.PaymentStatusChange:
        return 'PaymentStatusChange'

      case BraspagChangeType.FraudAnalysisChange:
        return 'FraudAnalysisChange'

      case BraspagChangeType.Chargeback:
        return 'Chargeback'

      default:
        return `Unknown(${changeType})`
    }
  }

  private getStatusName(status: number | undefined): string {
    if (status === undefined) return 'undefined'

    const statusNames: Record<number, string> = {
      0: 'NotFinished',
      1: 'Pending',
      2: 'Paid',
      3: 'Denied',
      10: 'Voided',
      11: 'Refunded',
      12: 'PendingAuth',
      13: 'Aborted',
      20: 'Scheduled',
    }

    return statusNames[status] ?? `Unknown(${status})`
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
      const storedPayment = await context.clients.vbase.getJSON<
        StoredBraspagPayment
      >(VBASE_BUCKETS.BRASPAG_PAYMENTS, paymentId, true)

      return storedPayment
    } catch (error) {
      this.logger.error('PIX.NOTIFY.STORAGE_ERROR', error, {
        flow: 'notification',
        action: 'storage_read_failed',
        paymentId,
        error: error instanceof Error ? error.message : String(error),
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
        this.logger.warn('PIX.NOTIFY.UNKNOWN_CHANGE_TYPE', {
          flow: 'notification',
          action: 'unknown_change_type',
          paymentId: PaymentId,
          changeType: ChangeType,
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

    // Determine effective status and amount (fallback to Braspag query if missing)
    let effectiveStatus = status
    let effectiveAmount = amount

    if (
      (effectiveStatus === undefined || effectiveAmount === undefined) &&
      context.clients.braspag?.queryPixStatus
    ) {
      try {
        const tx = (await context.clients.braspag.queryPixStatus(
          paymentId
        )) as { Payment?: { Status?: number; Amount?: number } }

        if (effectiveStatus === undefined) {
          effectiveStatus = tx.Payment?.Status
        }

        if (effectiveAmount === undefined) {
          effectiveAmount = tx.Payment?.Amount
        }

        this.logger.info('PIX.NOTIFY.BRASPAG_QUERY_FALLBACK', {
          flow: 'notification',
          action: 'braspag_query_fallback',
          paymentId,
          queriedStatus: tx.Payment?.Status,
          queriedAmount: tx.Payment?.Amount,
          notificationStatus: status,
          notificationAmount: amount,
        })
      } catch (error) {
        this.logger.warn('PIX.NOTIFY.BRASPAG_QUERY_FAILED', {
          flow: 'notification',
          action: 'braspag_query_failed',
          paymentId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Idempotency check: skip if status hasn't actually changed
    const finalEffectiveStatus = effectiveStatus ?? storedPayment.status
    const finalEffectiveAmount = effectiveAmount ?? storedPayment.amount
    const statusChanged = finalEffectiveStatus !== storedPayment.status
    const amountChanged =
      finalEffectiveAmount !== undefined &&
      finalEffectiveAmount !== storedPayment.amount

    if (!statusChanged && !amountChanged) {
      this.logger.info('PIX.NOTIFY.DUPLICATE', {
        flow: 'notification',
        action: 'duplicate_notification',
        paymentId,
        currentStatus: storedPayment.status,
        currentStatusName: this.getStatusName(storedPayment.status),
      })

      return
    }

    this.logger.info('PIX.NOTIFY.STATUS_CHANGED', {
      flow: 'notification',
      action: 'status_transition',
      paymentId,
      vtexPaymentId: storedPayment.vtexPaymentId,
      orderId: storedPayment.orderId,
      previousStatus: storedPayment.status,
      previousStatusName: this.getStatusName(storedPayment.status),
      newStatus: effectiveStatus,
      newStatusName: this.getStatusName(effectiveStatus),
      previousAmountCents: storedPayment.amount,
      newAmountCents: effectiveAmount,
    })

    // Update stored payment status
    const updatedPayment: StoredBraspagPayment = {
      ...storedPayment,
      status: effectiveStatus ?? storedPayment.status,
      lastUpdated: new Date().toISOString(),
      ...(effectiveAmount !== undefined && { amount: effectiveAmount }),
    }

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
    }

    // Trigger VTEX retry callback only if status actually changed and not a final status
    const isFinalStatus =
      effectiveStatus === BRASPAG_STATUS.REFUNDED ||
      effectiveStatus === BRASPAG_STATUS.VOIDED ||
      effectiveStatus === BRASPAG_STATUS.DENIED ||
      effectiveStatus === BRASPAG_STATUS.ABORTED

    if (
      statusChanged &&
      !isFinalStatus &&
      storedPayment.callbackUrl &&
      context.clients.retry?.ping
    ) {
      try {
        await context.clients.retry.ping(storedPayment.callbackUrl)
        this.logger.info('PIX.NOTIFY.CALLBACK_SENT', {
          flow: 'notification',
          action: 'callback_ping_sent',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          newStatus: effectiveStatus,
          newStatusName: this.getStatusName(effectiveStatus),
        })
      } catch (error) {
        this.logger.warn('PIX.NOTIFY.CALLBACK_FAILED', {
          flow: 'notification',
          action: 'callback_ping_failed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          callbackUrl: storedPayment.callbackUrl,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else if (isFinalStatus) {
      this.logger.info('PIX.NOTIFY.FINAL_STATUS', {
        flow: 'notification',
        action: 'final_status_reached',
        paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        finalStatus: effectiveStatus,
        finalStatusName: this.getStatusName(effectiveStatus),
      })
    }

    // Process for PAID status - with PIX timing analysis
    if (effectiveStatus === BRASPAG_STATUS.PAID) {
      const elapsedMs = storedPayment.createdAt
        ? Date.now() - new Date(storedPayment.createdAt).getTime()
        : undefined

      const elapsedMinutes = elapsedMs
        ? Math.floor(elapsedMs / 1000 / 60)
        : undefined

      const isLatePayment = elapsedMs
        ? elapsedMs > PIX_TIMING.LATE_PAYMENT_THRESHOLD
        : false

      const isExpired = elapsedMs
        ? elapsedMs > PIX_TIMING.EXPIRED_THRESHOLD
        : false

      if (isExpired) {
        this.logger.error('PIX.NOTIFY.PAID_AFTER_EXPIRATION', {
          flow: 'notification',
          action: 'paid_after_pix_expired',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          amountCents: updatedPayment.amount,
          elapsedMinutes,
          elapsedMs,
          createdAt: storedPayment.createdAt,
          paidAt: new Date().toISOString(),
          riskLevel: 'CRITICAL',
          message:
            'Customer paid AFTER PIX QR code expiration (2h). VTEX likely already cancelled the order. Manual reconciliation required.',
        })
      } else if (isLatePayment) {
        this.logger.warn('PIX.NOTIFY.PAID_LATE', {
          flow: 'notification',
          action: 'late_payment_confirmed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          amountCents: updatedPayment.amount,
          elapsedMinutes,
          elapsedMs,
          createdAt: storedPayment.createdAt,
          paidAt: new Date().toISOString(),
          riskLevel: 'WARNING',
          message:
            'Customer paid close to PIX expiration (>90min of 120min). Monitor for potential timing issues.',
        })
      } else {
        this.logger.info('PIX.NOTIFY.PAID', {
          flow: 'notification',
          action: 'payment_confirmed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          amountCents: updatedPayment.amount,
          elapsedMinutes,
          elapsedMs,
          createdAt: storedPayment.createdAt,
          paidAt: new Date().toISOString(),
          hasSplit: !!storedPayment.splitPayments?.length,
          splitCount: storedPayment.splitPayments?.length ?? 0,
        })
      }

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
      // No forwarding to store-services here to avoid notification loops.
      // Split is automatically processed by Braspag during payment.

      this.logger.info('PIX.NOTIFY.PAID_PROCESSED', {
        flow: 'notification',
        action: 'paid_processing_completed',
        paymentId: PaymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        orderId: storedPayment.orderId,
        merchantOrderId: storedPayment.merchantOrderId,
      })
    } catch (error) {
      this.logger.error('PIX.NOTIFY.PAID_PROCESSING_FAILED', error, {
        flow: 'notification',
        action: 'paid_processing_failed',
        paymentId: PaymentId,
        orderId: storedPayment.orderId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async handleFraudAnalysisChange(params: {
    paymentId: string
    status: number | undefined
    storedPayment: StoredBraspagPayment
    context: NotificationContext
  }): Promise<void> {
    const { paymentId, status, storedPayment, context } = params

    this.logger.warn('PIX.NOTIFY.FRAUD_ANALYSIS', {
      flow: 'notification',
      action: 'fraud_analysis_change',
      paymentId,
      vtexPaymentId: storedPayment.vtexPaymentId,
      orderId: storedPayment.orderId,
      fraudStatus: status,
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

    this.logger.error(
      'PIX.NOTIFY.CHARGEBACK',
      new Error('Chargeback received'),
      {
        flow: 'notification',
        action: 'chargeback_received',
        paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        orderId: storedPayment.orderId,
        merchantOrderId: storedPayment.merchantOrderId,
        chargebackStatus: status,
        amountCents: storedPayment.amount,
      }
    )

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
