/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  SettlementRequest,
  SettlementResponse,
  Settlements,
} from '@vtex/payment-provider'

import {
  PixOperationsService,
  PixOperationsServiceDependencies,
  PixOperationsServiceFactoryParams,
} from './types'
import { PaymentStatusHandler } from '../payment-status-handler'
import {
  QueryPixStatusResponse,
  VoidPixResponse,
} from '../../clients/braspag/types'
import { BRASPAG_STATUS } from '../../constants/payment-constants'

export class BraspagPixOperationsService implements PixOperationsService {
  constructor(private readonly deps: PixOperationsServiceDependencies) {}

  public async cancelPayment(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse> {
    const startTime = Date.now()

    try {
      const storedPayment = await this.deps.storageService.getStoredPayment(
        cancellation.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn('PIX.CANCEL.NOT_FOUND', {
          flow: 'cancellation',
          action: 'payment_not_found',
          paymentId: cancellation.paymentId,
          paymentFound: !!storedPayment,
          paymentType: storedPayment?.type,
        })

        throw new Error('PIX payment not found or invalid payment type')
      }

      this.deps.logger.info('PIX.CANCEL.STARTED', {
        flow: 'cancellation',
        action: 'cancellation_started',
        paymentId: cancellation.paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        storedStatus: storedPayment.status,
        amountCents: storedPayment.amount,
        createdAt: storedPayment.createdAt,
        elapsedMs: storedPayment.createdAt
          ? Date.now() - new Date(storedPayment.createdAt).getTime()
          : undefined,
      })

      let paymentStatus: QueryPixStatusResponse | null = null

      try {
        paymentStatus = await this.deps.queryClient.getTransactionByPaymentId<
          QueryPixStatusResponse
        >(storedPayment.pixPaymentId)
      } catch (error) {
        if (error?.message?.includes('not found')) {
          this.deps.logger.warn('PIX.CANCEL.BRASPAG_NOT_FOUND', {
            flow: 'cancellation',
            action: 'payment_not_found_in_braspag',
            paymentId: cancellation.paymentId,
            pixPaymentId: storedPayment.pixPaymentId,
          })
        } else {
          throw error
        }
      }

      const currentStatus =
        paymentStatus?.Payment?.Status ?? storedPayment.status ?? 0

      const { Payment: payment } =
        paymentStatus ??
        ({
          Payment: {
            PaymentId: storedPayment.pixPaymentId,
            Status: currentStatus,
          },
        } as any)

      // Already refunded - just approve
      if (currentStatus === BRASPAG_STATUS.REFUNDED) {
        this.deps.logger.info('PIX.CANCEL.ALREADY_REFUNDED', {
          flow: 'cancellation',
          action: 'already_refunded',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          braspagStatus: currentStatus,
          durationMs: Date.now() - startTime,
        })

        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId as string,
          code: '11',
          message: 'PIX payment already refunded',
        })
      }

      // Already voided - just approve
      if (currentStatus === BRASPAG_STATUS.VOIDED) {
        this.deps.logger.info('PIX.CANCEL.ALREADY_VOIDED', {
          flow: 'cancellation',
          action: 'already_voided',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          braspagStatus: currentStatus,
          durationMs: Date.now() - startTime,
        })

        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId as string,
          code: '10',
          message: 'PIX payment already voided',
        })
      }

      // ===================================================================
      // CRITICAL: Always void/refund at Braspag to prevent orphaned payments
      // - If PENDING (0, 1, 12): void invalidates the QR code
      // - If PAID (2): void triggers a "devolução PIX" (refund to customer)
      // Without this, QR code stays active and customer can pay a cancelled order!
      // Per Cielo/Braspag docs: PUT /v2/sales/{paymentId}/void
      // ===================================================================
      let voidResult: VoidPixResponse | null = null
      let voidSuccess = false

      try {
        const braspagClient = this.createBraspagClient(cancellation)

        voidResult = await braspagClient.voidPixPayment(
          storedPayment.pixPaymentId
        )

        voidSuccess = true

        this.deps.logger.info('PIX.CANCEL.VOIDED_AT_BRASPAG', {
          flow: 'cancellation',
          action: 'braspag_void_success',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          previousBraspagStatus: currentStatus,
          voidStatus: voidResult?.Status,
          wasAlreadyPaid: currentStatus === BRASPAG_STATUS.PAID,
          isRefund: currentStatus === BRASPAG_STATUS.PAID,
          durationMs: Date.now() - startTime,
        })
      } catch (voidError) {
        // Log but don't fail cancellation - VTEX already decided to cancel.
        // The notification handler serves as safety net for paid-after-cancel.
        this.deps.logger.error('PIX.CANCEL.VOID_BRASPAG_FAILED', {
          flow: 'cancellation',
          action: 'braspag_void_failed',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          braspagStatus: currentStatus,
          wasAlreadyPaid: currentStatus === BRASPAG_STATUS.PAID,
          error:
            voidError instanceof Error ? voidError.message : String(voidError),
          riskLevel:
            currentStatus === BRASPAG_STATUS.PAID ? 'CRITICAL' : 'HIGH',
          message:
            currentStatus === BRASPAG_STATUS.PAID
              ? 'CRITICAL: Customer already paid but Braspag refund failed. Manual reconciliation required.'
              : 'Braspag void failed. QR code may still be active. Notification handler will auto-refund if customer pays.',
          durationMs: Date.now() - startTime,
        })
      }

      // Determine final status to store
      const newStatus =
        currentStatus === BRASPAG_STATUS.PAID && voidSuccess
          ? BRASPAG_STATUS.REFUNDED
          : BRASPAG_STATUS.VOIDED

      await this.deps.storageService.updatePaymentStatus(
        cancellation.paymentId,
        newStatus
      )

      // Build response message based on what happened
      const wasPaid = currentStatus === BRASPAG_STATUS.PAID
      const responseCode = voidSuccess
        ? newStatus.toString()
        : currentStatus.toString()

      const responseMessage = wasPaid
        ? voidSuccess
          ? 'PIX payment refunded (devolução) - customer will receive the money back'
          : 'PIX cancellation approved but Braspag refund failed - manual refund required'
        : voidSuccess
        ? 'PIX payment cancelled and QR code invalidated at Braspag'
        : 'PIX payment cancelled locally - QR code invalidation at Braspag failed'

      this.deps.logger.info('PIX.CANCEL.APPROVED', {
        flow: 'cancellation',
        action: 'cancellation_approved',
        paymentId: cancellation.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: storedPayment.orderId,
        previousStatus: storedPayment.status,
        braspagStatus: currentStatus,
        newStatus,
        voidSuccess,
        wasAlreadyPaid: wasPaid,
        isRefund: wasPaid,
        reason: wasPaid ? 'refunded_paid_payment' : 'cancelled_before_payment',
        durationMs: Date.now() - startTime,
      })

      return Cancellations.approve(cancellation, {
        cancellationId: payment.PaymentId as string,
        code: responseCode,
        message: responseMessage,
      })
    } catch (error) {
      this.deps.logger.error('PIX.CANCEL.FAILED', {
        flow: 'cancellation',
        action: 'cancellation_failed',
        paymentId: cancellation.paymentId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: Date.now() - startTime,
      })

      return Cancellations.deny(cancellation, {
        code: 'ERROR',
        message: `PIX cancellation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public async settlePayment(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    const startTime = Date.now()

    try {
      const { paymentId } = settlement

      const storedPayment = await this.deps.storageService.getStoredPayment(
        paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn('PIX.SETTLE.NOT_FOUND', {
          flow: 'settlement',
          action: 'payment_not_found',
          paymentId,
          paymentFound: !!storedPayment,
          paymentType: storedPayment?.type,
        })

        throw new Error('PIX payment not found or invalid payment type')
      }

      const statusInfo = PaymentStatusHandler.getStatusInfo(
        storedPayment.status ?? 0
      )

      if (statusInfo.canSettle) {
        this.deps.logger.info('PIX.SETTLE.APPROVED', {
          flow: 'settlement',
          action: 'settlement_approved',
          paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          braspagStatus: storedPayment.status,
          statusDescription: statusInfo.statusDescription,
          amountCents: storedPayment.amount,
          settlementValueBRL: settlement.value,
          hasSplit: !!storedPayment.splitPayments?.length,
          splitCount: storedPayment.splitPayments?.length ?? 0,
          durationMs: Date.now() - startTime,
        })

        return Settlements.approve(settlement, {
          settleId: storedPayment.pixPaymentId,
          code: storedPayment.status?.toString() ?? '2',
          message: 'PIX payment settled successfully',
        })
      }

      this.deps.logger.warn('PIX.SETTLE.DENIED', {
        flow: 'settlement',
        action: 'settlement_denied',
        paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        braspagStatus: storedPayment.status,
        statusDescription: statusInfo.statusDescription,
        canSettle: statusInfo.canSettle,
        isPending: statusInfo.isPending,
        isAlreadyCancelled: statusInfo.isAlreadyCancelled,
        durationMs: Date.now() - startTime,
      })

      return Settlements.deny(settlement, {
        code: storedPayment.status?.toString() ?? 'INVALID_STATUS',
        message: `PIX payment cannot be settled. Status: ${statusInfo.statusDescription}`,
      })
    } catch (error) {
      this.deps.logger.error('PIX.SETTLE.FAILED', {
        flow: 'settlement',
        action: 'settlement_failed',
        paymentId: settlement.paymentId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: Date.now() - startTime,
      })

      return Settlements.deny(settlement, {
        code: 'ERROR',
        message: `PIX settlement failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  /**
   * Create a Braspag client from the request's merchantSettings.
   * Follows the same pattern used in connector.ts refund flow.
   */
  private createBraspagClient(request: unknown) {
    const extended = (request as unknown) as {
      merchantSettings?: Array<{ name: string; value: string }>
      paymentId?: string
    }

    const merchantSettings = this.deps.configService.getMerchantSettings({
      merchantSettings: extended.merchantSettings,
      paymentId: extended.paymentId ?? '',
    })

    return this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )
  }
}

export class PixOperationsServiceFactory {
  public static create(
    params: PixOperationsServiceFactoryParams
  ): PixOperationsService {
    return new BraspagPixOperationsService({
      configService: params.configService,
      storageService: params.storageService,
      clientFactory: params.clientFactory,
      queryClient: params.queryClient,
      context: params.context,
      logger: params.logger,
      ordersClient: params.ordersClient,
      giftcardsClient: params.giftcardsClient,
    })
  }
}
