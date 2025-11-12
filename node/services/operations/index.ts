/* eslint-disable no-console */
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
        throw new Error('PIX payment not found or invalid payment type')
      }

      const merchantSettings = this.getMerchantSettings(cancellation)
      const braspagClient = this.deps.clientFactory.createClient(
        this.deps.context,
        merchantSettings
      )

      let paymentStatus: any

      try {
        paymentStatus = await braspagClient.queryPixPaymentStatus(
          storedPayment.pixPaymentId
        )
      } catch (error) {
        if (error?.message?.includes('not found')) {
          this.deps.logger.warn(
            'Payment not found in Braspag, approving cancellation',
            {
              paymentId: cancellation.paymentId,
              pixPaymentId: storedPayment.pixPaymentId,
            }
          )

          return Cancellations.approve(cancellation, {
            cancellationId: storedPayment.pixPaymentId,
            code: 'NOT_FOUND',
            message: 'PIX payment not found in Braspag - cancellation approved',
          })
        }

        throw error
      }

      const { Payment: payment } = paymentStatus
      const statusInfo = PaymentStatusHandler.getStatusInfo(payment.Status ?? 0)

      if (statusInfo.isAlreadyPaid) {
        return Cancellations.deny(cancellation, {
          code: 'PAID',
          message: 'PIX payment cannot be cancelled - already paid',
        })
      }

      if (statusInfo.isAlreadyCancelled) {
        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId,
          code: payment.Status?.toString() ?? 'CANCELLED',
          message: 'PIX payment already cancelled',
        })
      }

      if (statusInfo.canCancel) {
        await this.deps.storageService.updatePaymentStatus(
          cancellation.paymentId,
          10
        )

        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId,
          code: '10',
          message: 'PIX payment cancellation requested successfully',
        })
      }

      return Cancellations.deny(cancellation, {
        code: payment.Status?.toString() ?? 'UNKNOWN',
        message: `PIX payment cannot be cancelled. Status: ${statusInfo.statusDescription}`,
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
      context: params.context,
      logger: params.logger,
    })
  }
}
