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

      this.deps.logger.info('PIX CANCELLATION: Stored payment', {
        storedPayment,
      })

      if (!storedPayment || storedPayment.type !== 'pix') {
        throw new Error('PIX payment not found or invalid payment type')
      }

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
            'Payment not found in Braspag before cancel, attempting void anyway',
            {
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

      // If already refunded/voided
      if (currentStatus === 11) {
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
            this.deps.logger.warn(
              'PIX CANCELLATION: Split transactional error detected, voucher refund required',
              {
                paymentId: cancellation.paymentId,
                providerReturnCode: voidResponse.ProviderReturnCode,
                reasonCode: voidResponse.ReasonCode,
                reasonMessage: voidResponse.ReasonMessage,
                voidSplitErrors: voidResponse.VoidSplitErrors,
              }
            )

            const errorDetails = JSON.stringify({
              providerReturnCode: voidResponse.ProviderReturnCode,
              providerReturnMessage: voidResponse.ProviderReturnMessage,
              reasonCode: voidResponse.ReasonCode,
              reasonMessage: voidResponse.ReasonMessage,
              voidSplitErrors: voidResponse.VoidSplitErrors,
              requiresVoucherRefund: true,
            })

            return Cancellations.deny(cancellation, {
              code: 'BP335',
              message: `Cancel aborted by Split transactional error. Please use voucher refund instead. Details: ${errorDetails}`,
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
            this.deps.logger.warn(
              'PIX CANCELLATION: Split transactional error detected in exception, voucher refund required',
              {
                paymentId: cancellation.paymentId,
                providerReturnCode: errorResponse?.ProviderReturnCode,
                reasonCode: errorResponse?.ReasonCode,
                reasonMessage: errorResponse?.ReasonMessage,
                voidSplitErrors: errorResponse?.VoidSplitErrors,
              }
            )

            const errorDetails = JSON.stringify({
              providerReturnCode: errorResponse?.ProviderReturnCode,
              reasonCode: errorResponse?.ReasonCode,
              reasonMessage: errorResponse?.ReasonMessage,
              voidSplitErrors: errorResponse?.VoidSplitErrors,
              requiresVoucherRefund: true,
            })

            return Cancellations.deny(cancellation, {
              code: 'BP335',
              message: `Cancel aborted by Split transactional error. Please use voucher refund instead. Details: ${errorDetails}`,
            })
          }

          throw error
        }
      }

      // If not paid yet, cancel locally without calling Braspag void
        await this.deps.storageService.updatePaymentStatus(
          cancellation.paymentId,
          10
        )

        return Cancellations.approve(cancellation, {
        cancellationId: payment.PaymentId as string,
          code: '10',
        message: 'PIX payment cancelled before confirmation',
      })
    } catch (error) {
      this.deps.logger.error('PIX cancellation failed', error)

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
    this.deps.logger.info('VTEX_SETTLEMENT: Processing settlement request', {
      paymentId: settlement.paymentId,
      value: settlement.value,
      tid: settlement.tid,
    })

    try {
      const { paymentId } = settlement

      this.deps.logger.info('VTEX_SETTLEMENT: Getting stored payment', {
        paymentId,
      })

      const storedPayment = await this.deps.storageService.getStoredPayment(
        paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        throw new Error('PIX payment not found or invalid payment type')
      }

      this.deps.logger.info('VTEX_SETTLEMENT: Stored payment found', {
        paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        braspagTransactionId: storedPayment.braspagTransactionId,
        amount: storedPayment.amount,
        status: storedPayment.status,
      })

      const statusInfo = PaymentStatusHandler.getStatusInfo(
        storedPayment.status ?? 0
      )

      if (statusInfo.canSettle) {
        this.deps.logger.info('VTEX_SETTLEMENT: Payment can be settled', {
          paymentId,
          status: storedPayment.status,
          statusDescription: statusInfo.statusDescription,
        })

        this.deps.logger.info('Mary Kay PIX settlement processed', {
          paymentId,
          consultantSplitAmount: storedPayment.consultantSplitAmount,
          masterSplitAmount: storedPayment.masterSplitAmount,
          splitPayments: storedPayment.splitPayments,
        })

        return Settlements.approve(settlement, {
          settleId: storedPayment.pixPaymentId,
          code: storedPayment.status?.toString() ?? '2',
          message: 'PIX payment settled successfully',
        })
      }

      this.deps.logger.warn('VTEX_SETTLEMENT: Payment cannot be settled', {
        paymentId,
        status: storedPayment.status,
        statusDescription: statusInfo.statusDescription,
      })

      return Settlements.deny(settlement, {
        code: storedPayment.status?.toString() ?? 'INVALID_STATUS',
        message: `PIX payment cannot be settled. Status: ${statusInfo.statusDescription}`,
      })
    } catch (error) {
      this.deps.logger.error('VTEX_SETTLEMENT: Settlement failed', error, {
        paymentId: settlement.paymentId,
      })

      this.deps.logger.error('PIX settlement failed', error)

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

    const settings = this.deps.configService.getMerchantSettings(authData)

    this.deps.logger.info('Merchant settings extracted for operation', {
      merchantId: settings.merchantId,
      hasClientSecret: !!settings.clientSecret,
      hasMerchantKey: !!settings.merchantKey,
    })

    return settings
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
    })
  }
}
