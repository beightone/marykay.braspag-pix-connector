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
    try {
      const storedPayment = await this.deps.storageService.getStoredPayment(
        cancellation.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn(
          '[PIX_CANCEL] Payment not found or invalid type',
          {
            flow: 'cancellation',
            action: 'payment_validation_failed',
            paymentId: cancellation.paymentId,
            paymentFound: !!storedPayment,
            paymentType: storedPayment?.type,
          }
        )

        throw new Error('PIX payment not found or invalid payment type')
      }

      this.deps.logger.info('[PIX_CANCEL] Starting cancellation process', {
        flow: 'cancellation',
        action: 'cancellation_started',
        paymentId: cancellation.paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        amount: storedPayment.amount,
      })

      const merchantSettings = this.getMerchantSettings(cancellation)
      const braspagClient = this.deps.clientFactory.createClient(
        this.deps.context,
        merchantSettings
      )

      let paymentStatus: QueryPixStatusResponse | null = null

      try {
        paymentStatus = await this.deps.queryClient.getTransactionByPaymentId<
          QueryPixStatusResponse
        >(storedPayment.pixPaymentId)
      } catch (error) {
        if (error?.message?.includes('not found')) {
          this.deps.logger.warn(
            '[PIX_CANCEL] Payment not found in Braspag, attempting void anyway',
            {
              flow: 'cancellation',
              action: 'payment_not_found_in_braspag',
              paymentId: cancellation.paymentId,
              pixPaymentId: storedPayment.pixPaymentId,
            }
          )
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

      if (currentStatus === 11) {
        this.deps.logger.info('[PIX_CANCEL] Payment already refunded', {
          flow: 'cancellation',
          action: 'already_refunded',
          paymentId: cancellation.paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          status: currentStatus,
        })

        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId as string,
          code: '11',
          message: 'PIX payment already refunded',
        })
      }

      // If paid, perform total void (refund)
      if (currentStatus === 2) {
        try {
          const voidResponse = await braspagClient.voidPixPayment(
            payment.PaymentId as string
          )

          const isSplitError =
            voidResponse.ProviderReturnCode === 'BP335' ||
            voidResponse.ReasonCode === 37 ||
            voidResponse.ReasonMessage === 'SplitTransactionalError'

          if (isSplitError) {
            const errorDetails = JSON.stringify({
              providerReturnCode: voidResponse.ProviderReturnCode,
              providerReturnMessage: voidResponse.ProviderReturnMessage,
              reasonCode: voidResponse.ReasonCode,
              reasonMessage: voidResponse.ReasonMessage,
              voidSplitErrors: voidResponse.VoidSplitErrors,
            })

            return Cancellations.deny(cancellation, {
              code: 'BP335',
              message: `PIX cancellation failed due to split transactional error. Details: ${errorDetails}`,
            })
          }

          await this.deps.storageService.updatePaymentStatus(
            cancellation.paymentId,
            11
          )

          return Cancellations.approve(cancellation, {
            cancellationId: payment.PaymentId as string,
            code: (voidResponse.Status ?? 11).toString(),
            message: 'PIX total void requested successfully',
          })
        } catch (error) {
          const errorResponse = error?.response?.data as
            | {
                ProviderReturnCode?: string
                ReasonCode?: number
                ReasonMessage?: string
                VoidSplitErrors?: Array<{ Code: number; Message: string }>
              }
            | undefined

          const isSplitError =
            errorResponse?.ProviderReturnCode === 'BP335' ||
            errorResponse?.ReasonCode === 37 ||
            errorResponse?.ReasonMessage === 'SplitTransactionalError'

          if (isSplitError) {
            const errorDetails = JSON.stringify({
              providerReturnCode: errorResponse?.ProviderReturnCode,
              reasonCode: errorResponse?.ReasonCode,
              reasonMessage: errorResponse?.ReasonMessage,
              voidSplitErrors: errorResponse?.VoidSplitErrors,
            })

            return Cancellations.deny(cancellation, {
              code: 'BP335',
              message: `PIX cancellation failed due to split transactional error. Details: ${errorDetails}`,
            })
          }

          throw error
        }
      }

      await this.deps.storageService.updatePaymentStatus(
        cancellation.paymentId,
        10
      )

      this.deps.logger.info(
        '[PIX_CANCEL] Payment cancelled before confirmation',
        {
          flow: 'cancellation',
          action: 'cancelled_before_payment',
          paymentId: cancellation.paymentId,
          pixPaymentId: payment.PaymentId,
          status: currentStatus,
        }
      )

      return Cancellations.approve(cancellation, {
        cancellationId: payment.PaymentId as string,
        code: '10',
        message: 'PIX payment cancelled before confirmation',
      })
    } catch (error) {
      this.deps.logger.error('[PIX_CANCEL] Cancellation failed', {
        flow: 'cancellation',
        action: 'cancellation_error',
        paymentId: cancellation.paymentId,
        error: error instanceof Error ? error.message : String(error),
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
    try {
      const { paymentId } = settlement

      const storedPayment = await this.deps.storageService.getStoredPayment(
        paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.deps.logger.warn(
          '[PIX_SETTLE] Payment not found or invalid type',
          {
            flow: 'settlement',
            action: 'payment_validation_failed',
            paymentId,
            paymentFound: !!storedPayment,
            paymentType: storedPayment?.type,
          }
        )

        throw new Error('PIX payment not found or invalid payment type')
      }

      this.deps.logger.info('[PIX_SETTLE] Starting settlement process', {
        flow: 'settlement',
        action: 'settlement_validation',
        paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        amount: storedPayment.amount,
        status: storedPayment.status,
      })

      const statusInfo = PaymentStatusHandler.getStatusInfo(
        storedPayment.status ?? 0
      )

      if (statusInfo.canSettle) {
        this.deps.logger.info('[PIX_SETTLE] Settlement approved', {
          flow: 'settlement',
          action: 'settlement_approved',
          paymentId,
          pixPaymentId: storedPayment.pixPaymentId,
          status: storedPayment.status,
          statusDescription: statusInfo.statusDescription,
          consultantSplitAmount: storedPayment.consultantSplitAmount,
          masterSplitAmount: storedPayment.masterSplitAmount,
          hasSplitPayments: !!storedPayment.splitPayments,
        })

        return Settlements.approve(settlement, {
          settleId: storedPayment.pixPaymentId,
          code: storedPayment.status?.toString() ?? '2',
          message: 'PIX payment settled successfully',
        })
      }

      this.deps.logger.warn('[PIX_SETTLE] Payment cannot be settled', {
        flow: 'settlement',
        action: 'settlement_denied',
        paymentId,
        status: storedPayment.status,
        statusDescription: statusInfo.statusDescription,
      })

      return Settlements.deny(settlement, {
        code: storedPayment.status?.toString() ?? 'INVALID_STATUS',
        message: `PIX payment cannot be settled. Status: ${statusInfo.statusDescription}`,
      })
    } catch (error) {
      this.deps.logger.error('[PIX_SETTLE] Settlement failed', {
        flow: 'settlement',
        action: 'settlement_error',
        paymentId: settlement.paymentId,
        error: error instanceof Error ? error.message : String(error),
      })

      return Settlements.deny(settlement, {
        code: 'ERROR',
        message: `PIX settlement failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  private getMerchantSettings(
    request: CancellationRequest | SettlementRequest
  ) {
    const extended = (request as unknown) as {
      merchantSettings?: Array<{ name: string; value: string }>
    }

    const authData = {
      merchantSettings: extended.merchantSettings,
      paymentId: request.paymentId,
    }

    return this.deps.configService.getMerchantSettings(authData)
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
