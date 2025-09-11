import {
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  SettlementRequest,
  SettlementResponse,
  Settlements,
} from '@vtex/payment-provider'

import { IOContext } from '@vtex/api'
import { PaymentConfigurationService } from './payment-configuration-service'
import { VBasePaymentStorageService } from './payment-storage-service'
import { BraspagClientFactory } from './braspag-client-factory'
import { StructuredLogger } from '../utils/structured-logger'
import { PaymentStatusHandler } from './payment-status-handler'

export interface PixOperationsService {
  cancelPayment(cancellation: CancellationRequest): Promise<CancellationResponse>
  settlePayment(settlement: SettlementRequest): Promise<SettlementResponse>
}

interface PixOperationsServiceDependencies {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  context: IOContext
  logger: StructuredLogger
}

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

      const braspagClient = await this.createBraspagClient(cancellation.paymentId)
      const paymentStatus = await braspagClient.queryPixPaymentStatus(
        storedPayment.pixPaymentId
      )

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
        await this.deps.storageService.updatePaymentStatus(cancellation.paymentId, 10)

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
    try {
      const { tid } = settlement

      if (!tid) {
        throw new Error('Transaction ID (tid) is required for settlement')
      }

      const storedPayment = await this.deps.storageService.getStoredPayment(
        settlement.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        throw new Error('PIX payment not found or invalid payment type')
      }

      const braspagClient = await this.createBraspagClient(settlement.paymentId)
      const paymentStatus = await braspagClient.queryPixPaymentStatus(tid)
      const { Payment: payment } = paymentStatus

      const statusInfo = PaymentStatusHandler.getStatusInfo(payment.Status ?? 0)

      if (statusInfo.canSettle) {
        return Settlements.approve(settlement, {
          settleId: payment.PaymentId,
          code: payment.Status?.toString() ?? '2',
          message: 'PIX payment successfully settled',
        })
      }

      return Settlements.deny(settlement, {
        code: payment.Status?.toString() ?? 'DENIED',
        message: `PIX payment cannot be settled. Status: ${statusInfo.statusDescription}`,
      })
    } catch (error) {
      this.deps.logger.error('PIX settlement failed', error)

      return Settlements.deny(settlement, {
        code: 'ERROR',
        message: `PIX settlement failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  private async createBraspagClient(paymentId: string) {
    const merchantSettings = this.deps.configService.getMerchantSettings({
      merchantSettings: [],
      paymentId,
      paymentMethod: 'Pix',
      miniCart: { paymentMethod: 'Pix' },
    })

    return this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )
  }
}

interface PixOperationsServiceFactoryParams {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  context: IOContext
  logger: StructuredLogger
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
