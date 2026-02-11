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

    this.logger.info('[NOTIFICATION] Received', {
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
      this.logger.warn('[NOTIFICATION] Payment not found in storage', {
        flow: 'notification',
        action: 'payment_not_found',
        paymentId: PaymentId,
        changeType: ChangeType,
        merchantOrderId: MerchantOrderId,
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
      this.logger.error('[NOTIFICATION] Storage read failed', error, {
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
    const { PaymentId, ChangeType, Status, Amount, MerchantOrderId } = notification

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
        this.logger.warn('[NOTIFICATION] Unknown change type', {
          flow: 'notification',
          action: 'unknown_change_type',
          paymentId: PaymentId,
          merchantOrderId: MerchantOrderId,
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

    const merchantOrderId = notification.MerchantOrderId ?? storedPayment.merchantOrderId

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

        this.logger.info('[NOTIFICATION] Braspag query fallback used', {
          flow: 'notification',
          action: 'braspag_query_fallback',
          paymentId,
          merchantOrderId,
          queriedStatus: tx.Payment?.Status,
          queriedAmount: tx.Payment?.Amount,
          notificationStatus: status,
          notificationAmount: amount,
        })
      } catch (error) {
        this.logger.warn('[NOTIFICATION] Braspag query fallback failed', {
          flow: 'notification',
          action: 'braspag_query_failed',
          paymentId,
          merchantOrderId,
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
      this.logger.info(
        '[NOTIFICATION] Status and amount unchanged, skipping update',
        {
          flow: 'notification',
          action: 'duplicate_notification',
          paymentId,
          merchantOrderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          buyerDocument: storedPayment.buyerDocument,
          currentStatus: storedPayment.status,
          currentStatusName: this.getStatusName(storedPayment.status),
        }
      )

      return
    }

    this.logger.info('[NOTIFICATION] Status changed', {
      flow: 'notification',
      action: 'status_transition',
      paymentId,
      vtexPaymentId: storedPayment.vtexPaymentId,
      orderId: storedPayment.orderId,
      merchantOrderId: storedPayment.merchantOrderId,
      buyerDocument: storedPayment.buyerDocument,
      buyerEmail: storedPayment.buyerEmail,
      buyerName: storedPayment.buyerName,
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
        this.logger.info('[NOTIFICATION] Callback sent to VTEX', {
          flow: 'notification',
          action: 'callback_ping_sent',
          paymentId,
          merchantOrderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          buyerDocument: storedPayment.buyerDocument,
          newStatus: effectiveStatus,
          newStatusName: this.getStatusName(effectiveStatus),
        })
      } catch (error) {
        this.logger.warn('[NOTIFICATION] Callback to VTEX failed', {
          flow: 'notification',
          action: 'callback_ping_failed',
          paymentId,
          merchantOrderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          buyerDocument: storedPayment.buyerDocument,
          callbackUrl: storedPayment.callbackUrl,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else if (isFinalStatus) {
      this.logger.info(
        '[NOTIFICATION] Final status reached, no callback needed',
        {
          flow: 'notification',
          action: 'final_status_reached',
          paymentId,
          merchantOrderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          buyerDocument: storedPayment.buyerDocument,
          finalStatus: effectiveStatus,
          finalStatusName: this.getStatusName(effectiveStatus),
        }
      )
    }

    // Process for PAID status - with PIX timing analysis and cancel protection
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

      const wasAlreadyCancelled = !!storedPayment.cancelledAt

      // ===================================================================
      // SAFETY NET: Auto-refund if customer paid AFTER order was cancelled.
      // This happens when:
      // 1. VTEX cancels the order (timeout, error, etc.)
      // 2. Our cancel handler voids the QR code at Braspag
      // 3. BUT the void didn't work or customer already scanned the QR
      // 4. Braspag sends PAID notification
      // Per Cielo docs: "devolução PIX" via PUT /v2/sales/{paymentId}/void
      // Prazo: 90 days from original payment.
      // ===================================================================
      if (wasAlreadyCancelled) {
        this.logger.error(
          '[NOTIFICATION] CRITICAL: Customer paid after order cancelled',
          {
            flow: 'notification',
            action: 'paid_after_order_cancelled',
            paymentId,
            vtexPaymentId: storedPayment.vtexPaymentId,
            orderId: storedPayment.orderId,
            merchantOrderId: storedPayment.merchantOrderId,
            buyerDocument: storedPayment.buyerDocument,
            buyerEmail: storedPayment.buyerEmail,
            buyerName: storedPayment.buyerName,
            amountCents: updatedPayment.amount,
            cancelledAt: storedPayment.cancelledAt,
            paidAt: new Date().toISOString(),
            elapsedMinutes,
            riskLevel: 'CRITICAL',
            message:
              'Customer paid AFTER order was cancelled in VTEX. Triggering automatic refund (devolução PIX) at Braspag.',
          }
        )

        await this.triggerAutoRefund(paymentId, storedPayment, context)

        return
      }

      if (isExpired) {
        this.logger.error(
          '[NOTIFICATION] CRITICAL: Customer paid after PIX expiration',
          {
            flow: 'notification',
            action: 'paid_after_pix_expired',
            paymentId,
            vtexPaymentId: storedPayment.vtexPaymentId,
            orderId: storedPayment.orderId,
            merchantOrderId: storedPayment.merchantOrderId,
            buyerDocument: storedPayment.buyerDocument,
            buyerEmail: storedPayment.buyerEmail,
            buyerName: storedPayment.buyerName,
            amountCents: updatedPayment.amount,
            elapsedMinutes,
            elapsedMs,
            createdAt: storedPayment.createdAt,
            paidAt: new Date().toISOString(),
            riskLevel: 'CRITICAL',
            message:
              'Customer paid AFTER PIX QR code expiration (2h). VTEX likely already cancelled the order. Manual reconciliation required.',
          }
        )
      } else if (isLatePayment) {
        this.logger.warn('[NOTIFICATION] Late payment confirmed', {
          flow: 'notification',
          action: 'late_payment_confirmed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
          buyerName: storedPayment.buyerName,
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
        this.logger.info('[NOTIFICATION] Payment confirmed', {
          flow: 'notification',
          action: 'payment_confirmed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
          buyerName: storedPayment.buyerName,
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

      this.logger.info('[NOTIFICATION] Payment processed successfully', {
        flow: 'notification',
        action: 'paid_processing_completed',
        paymentId: PaymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        orderId: storedPayment.orderId,
        merchantOrderId: storedPayment.merchantOrderId,
      })
    } catch (error) {
      this.logger.error('[NOTIFICATION] Payment processing failed', error, {
        flow: 'notification',
        action: 'paid_processing_failed',
        paymentId: PaymentId,
        merchantOrderId: storedPayment.merchantOrderId,
        orderId: storedPayment.orderId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Auto-refund (devolução PIX) when customer paid after order was cancelled.
   * Per Cielo/Braspag docs: PUT /v2/sales/{paymentId}/void triggers a "devolução PIX".
   * The refund is not instantaneous - Braspag will send a notification when processed.
   * Prazo: 90 days from original payment per Banco Central regulations.
   */
  private async triggerAutoRefund(
    paymentId: string,
    storedPayment: StoredBraspagPayment,
    context: NotificationContext
  ): Promise<void> {
    if (!context.clients.braspag?.voidPixPayment) {
      this.logger.error(
        '[NOTIFICATION] Auto-refund impossible - no Braspag client',
        {
          flow: 'notification',
          action: 'auto_refund_no_void_client',
          paymentId,
          merchantOrderId: storedPayment.merchantOrderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
          riskLevel: 'CRITICAL',
          message:
            'Cannot auto-refund: Braspag void client not available in notification context. MANUAL REFUND REQUIRED.',
        }
      )

      return
    }

    try {
      await context.clients.braspag.voidPixPayment(paymentId)

      // Update stored payment status to REFUNDED
      const refundedPayment: StoredBraspagPayment = {
        ...storedPayment,
        status: BRASPAG_STATUS.REFUNDED,
        lastUpdated: new Date().toISOString(),
      }

      await context.clients.vbase.saveJSON(
        VBASE_BUCKETS.BRASPAG_PAYMENTS,
        paymentId,
        refundedPayment
      )

      if (storedPayment.vtexPaymentId) {
        await context.clients.vbase.saveJSON(
          VBASE_BUCKETS.BRASPAG_PAYMENTS,
          storedPayment.vtexPaymentId,
          refundedPayment
        )
      }

      this.logger.info('[NOTIFICATION] Auto-refund triggered successfully', {
        flow: 'notification',
        action: 'auto_refund_triggered',
        paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        orderId: storedPayment.orderId,
        merchantOrderId: storedPayment.merchantOrderId,
        buyerDocument: storedPayment.buyerDocument,
        buyerEmail: storedPayment.buyerEmail,
        buyerName: storedPayment.buyerName,
        amountCents: storedPayment.amount,
        cancelledAt: storedPayment.cancelledAt,
        refundedAt: new Date().toISOString(),
        message:
          'Auto-refund (devolução PIX) triggered successfully. Customer will receive the money back.',
      })
    } catch (refundError) {
      this.logger.error(
        '[NOTIFICATION] CRITICAL: Auto-refund FAILED - manual action required',
        {
          flow: 'notification',
          action: 'auto_refund_failed',
          paymentId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          orderId: storedPayment.orderId,
          merchantOrderId: storedPayment.merchantOrderId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
          buyerName: storedPayment.buyerName,
          amountCents: storedPayment.amount,
          cancelledAt: storedPayment.cancelledAt,
          error:
            refundError instanceof Error
              ? refundError.message
              : String(refundError),
          riskLevel: 'CRITICAL',
          message:
            'Auto-refund FAILED. Customer paid but order was cancelled. MANUAL REFUND REQUIRED IMMEDIATELY.',
        }
      )
    }
  }

  private async handleFraudAnalysisChange(params: {
    paymentId: string
    status: number | undefined
    storedPayment: StoredBraspagPayment
    context: NotificationContext
  }): Promise<void> {
    const { paymentId, status, storedPayment, context } = params

    this.logger.warn('[NOTIFICATION] Fraud analysis change received', {
      flow: 'notification',
      action: 'fraud_analysis_change',
      paymentId,
      merchantOrderId: storedPayment.merchantOrderId,
      vtexPaymentId: storedPayment.vtexPaymentId,
      orderId: storedPayment.orderId,
      buyerDocument: storedPayment.buyerDocument,
      buyerEmail: storedPayment.buyerEmail,
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
      '[NOTIFICATION] Chargeback received',
      new Error('Chargeback received'),
      {
        flow: 'notification',
        action: 'chargeback_received',
        paymentId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        orderId: storedPayment.orderId,
        merchantOrderId: storedPayment.merchantOrderId,
        buyerDocument: storedPayment.buyerDocument,
        buyerEmail: storedPayment.buyerEmail,
        buyerName: storedPayment.buyerName,
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
