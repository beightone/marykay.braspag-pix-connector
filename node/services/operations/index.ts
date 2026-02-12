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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let storedPayment: any = null

    try {
      storedPayment = await this.deps.storageService.getStoredPayment(
        cancellation.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn('[PIX_CANCEL] Payment not found in storage', {
          flow: 'cancellation',
          action: 'payment_not_found',
          paymentId: cancellation.paymentId,
          paymentFound: !!storedPayment,
          paymentType: storedPayment?.type,
          buyerDocument: storedPayment?.buyerDocument,
          buyerEmail: storedPayment?.buyerEmail,
        })

        throw new Error('PIX payment not found or invalid payment type')
      }

      this.deps.logger.info('[PIX_CANCEL] Cancellation started', {
        flow: 'cancellation',
        action: 'cancellation_started',
        paymentId: cancellation.paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        buyerDocument: storedPayment.buyerDocument,
        buyerEmail: storedPayment.buyerEmail,
        buyerName: storedPayment.buyerName,
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
          this.deps.logger.warn('[PIX_CANCEL] Payment not found in Braspag', {
            flow: 'cancellation',
            action: 'payment_not_found_in_braspag',
            paymentId: cancellation.paymentId,
            pixPaymentId: storedPayment.pixPaymentId,
            orderId: storedPayment.orderId,
            buyerDocument: storedPayment.buyerDocument,
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
        this.deps.logger.info('[PIX_CANCEL] Already refunded', {
          flow: 'cancellation',
          action: 'already_refunded',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
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
        this.deps.logger.info('[PIX_CANCEL] Already voided', {
          flow: 'cancellation',
          action: 'already_voided',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
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

        this.deps.logger.info(
          '[PIX_CANCEL] PIX voided at Braspag - QR code invalidated',
          {
            flow: 'cancellation',
            action: 'braspag_void_success',
            paymentId: cancellation.paymentId,
            pixPaymentId: storedPayment.pixPaymentId,
            orderId: storedPayment.orderId,
            vtexPaymentId: storedPayment.vtexPaymentId,
            buyerDocument: storedPayment.buyerDocument,
            buyerEmail: storedPayment.buyerEmail,
            previousBraspagStatus: currentStatus,
            voidStatus: voidResult?.Status,
            wasAlreadyPaid: currentStatus === BRASPAG_STATUS.PAID,
            isRefund: currentStatus === BRASPAG_STATUS.PAID,
            durationMs: Date.now() - startTime,
          }
        )
      } catch (voidError) {
        // Log but don't fail cancellation - VTEX already decided to cancel.
        // The notification handler serves as safety net for paid-after-cancel.
        this.deps.logger.error('[PIX_CANCEL] Failed to void PIX at Braspag', {
          flow: 'cancellation',
          action: 'braspag_void_failed',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
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

      this.deps.logger.info('[PIX_CANCEL] Cancellation approved', {
        flow: 'cancellation',
        action: 'cancellation_approved',
        paymentId: cancellation.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: storedPayment.orderId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        buyerDocument: storedPayment.buyerDocument,
        buyerEmail: storedPayment.buyerEmail,
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
      this.deps.logger.error('[PIX_CANCEL] Cancellation failed', {
        flow: 'cancellation',
        action: 'cancellation_failed',
        paymentId: cancellation.paymentId,
        orderId: storedPayment?.orderId,
        pixPaymentId: storedPayment?.pixPaymentId,
        vtexPaymentId: storedPayment?.vtexPaymentId,
        buyerDocument: storedPayment?.buyerDocument,
        buyerEmail: storedPayment?.buyerEmail,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let storedPayment: any = null

    try {
      const { paymentId } = settlement

      storedPayment = await this.deps.storageService.getStoredPayment(paymentId)

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn('[PIX_SETTLE] Payment not found in storage', {
          flow: 'settlement',
          action: 'payment_not_found',
          paymentId,
          paymentFound: !!storedPayment,
          paymentType: storedPayment?.type,
          buyerDocument: storedPayment?.buyerDocument,
        })

        throw new Error('PIX payment not found or invalid payment type')
      }

      let currentStatus = storedPayment.status ?? 0

      if (this.deps.queryClient) {
        try {
          const paymentStatus =
            await this.deps.queryClient.getTransactionByPaymentId<
              QueryPixStatusResponse
            >(storedPayment.pixPaymentId)

          const braspagStatus = paymentStatus?.Payment?.Status

          if (braspagStatus !== undefined) {
            currentStatus = braspagStatus

            if (braspagStatus !== storedPayment.status) {
              await this.deps.storageService.updatePaymentStatus(
                paymentId,
                braspagStatus
              )
              await this.deps.storageService.updatePaymentStatus(
                storedPayment.pixPaymentId,
                braspagStatus
              )
              this.deps.logger.info(
                '[PIX_SETTLE] Braspag status differs from stored - updated',
                {
                  flow: 'settlement',
                  action: 'braspag_status_reconciled',
                  paymentId,
                  pixPaymentId: storedPayment.pixPaymentId,
                  storedStatus: storedPayment.status,
                  braspagStatus,
                }
              )
            }
          }
        } catch (queryError) {
          this.deps.logger.warn(
            '[PIX_SETTLE] Braspag query failed - using stored status',
            {
              flow: 'settlement',
              action: 'braspag_query_failed',
              paymentId,
              pixPaymentId: storedPayment.pixPaymentId,
              error:
                queryError instanceof Error
                  ? queryError.message
                  : String(queryError),
            }
          )
        }
      }

      const statusInfo = PaymentStatusHandler.getStatusInfo(currentStatus)

      if (statusInfo.canSettle) {
        this.deps.logger.info('[PIX_SETTLE] Settlement approved', {
          flow: 'settlement',
          action: 'settlement_approved',
          paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          vtexPaymentId: storedPayment.vtexPaymentId,
          buyerDocument: storedPayment.buyerDocument,
          buyerEmail: storedPayment.buyerEmail,
          buyerName: storedPayment.buyerName,
          braspagStatus: currentStatus,
          statusDescription: statusInfo.statusDescription,
          amountCents: storedPayment.amount,
          settlementValueBRL: settlement.value,
          hasSplit: !!storedPayment.splitPayments?.length,
          splitCount: storedPayment.splitPayments?.length ?? 0,
          durationMs: Date.now() - startTime,
        })

        return Settlements.approve(settlement, {
          settleId: storedPayment.pixPaymentId,
          code: currentStatus.toString(),
          message: 'PIX payment settled successfully',
        })
      }

      this.deps.logger.warn('[PIX_SETTLE] Settlement denied - invalid status', {
        flow: 'settlement',
        action: 'settlement_denied',
        paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        vtexPaymentId: storedPayment.vtexPaymentId,
        buyerDocument: storedPayment.buyerDocument,
        buyerEmail: storedPayment.buyerEmail,
        braspagStatus: currentStatus,
        statusDescription: statusInfo.statusDescription,
        canSettle: statusInfo.canSettle,
        isPending: statusInfo.isPending,
        isAlreadyCancelled: statusInfo.isAlreadyCancelled,
        durationMs: Date.now() - startTime,
      })

      return Settlements.deny(settlement, {
        code: currentStatus.toString(),
        message: `PIX payment cannot be settled. Status: ${statusInfo.statusDescription}`,
      })
    } catch (error) {
      this.deps.logger.error('[PIX_SETTLE] Settlement failed', {
        flow: 'settlement',
        action: 'settlement_failed',
        paymentId: settlement.paymentId,
        orderId: storedPayment?.orderId,
        pixPaymentId: storedPayment?.pixPaymentId,
        vtexPaymentId: storedPayment?.vtexPaymentId,
        buyerDocument: storedPayment?.buyerDocument,
        buyerEmail: storedPayment?.buyerEmail,
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
