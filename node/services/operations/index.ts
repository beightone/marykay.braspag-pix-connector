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
import { QueryPixStatusResponse } from '../../clients/braspag/types'

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

      // Protection: prevent cancellation if payment is already paid
      if (currentStatus === 2) {
        this.deps.logger.warn('PIX.CANCEL.DENIED_ALREADY_PAID', {
          flow: 'cancellation',
          action: 'cancel_denied_already_paid',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          orderId: storedPayment.orderId,
          braspagStatus: currentStatus,
          durationMs: Date.now() - startTime,
        })

        return Cancellations.deny(cancellation, {
          code: 'ALREADY_PAID',
          message: 'PIX payment cannot be cancelled - already paid by customer',
        })
      }

      if (currentStatus === 11) {
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

      await this.deps.storageService.updatePaymentStatus(
        cancellation.paymentId,
        10
      )

      this.deps.logger.info('PIX.CANCEL.APPROVED', {
        flow: 'cancellation',
        action: 'cancellation_approved',
        paymentId: cancellation.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: storedPayment.orderId,
        previousStatus: storedPayment.status,
        braspagStatus: currentStatus,
        newStatus: 10,
        reason: 'cancelled_before_payment',
        durationMs: Date.now() - startTime,
      })

      return Cancellations.approve(cancellation, {
        cancellationId: payment.PaymentId as string,
        code: '10',
        message: 'PIX payment cancelled before confirmation',
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
