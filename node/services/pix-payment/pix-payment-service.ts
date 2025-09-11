/* eslint-disable max-params */
/**
 * PIX Payment Service
 * Handles all PIX payment operations (cancel, settle, query status)
 */

import {
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  SettlementRequest,
  SettlementResponse,
  Settlements,
} from '@vtex/payment-provider'
import { IOContext } from '@vtex/api'

import { PaymentConfigurationService } from '../payment-configuration'
import { PaymentConnectorLogger } from '../../utils/structured-logger'
import {
  BRASPAG_STATUS,
  ERROR_CODES,
  RESPONSE_MESSAGES,
  PAYMENT_TYPES,
} from '../../constants/payment-constants'
import { StoredBraspagPayment } from '../../types/braspag-notifications'
import { BraspagClientFactory } from '../braspag-client-factory/types'
import { PaymentStorage } from '../payment-storage/types'

interface BraspagPayment {
  PaymentId: string
  Status?: number
}

export interface PixPaymentService {
  cancelPayment(request: CancellationRequest): Promise<CancellationResponse>
  settlePayment(request: SettlementRequest): Promise<SettlementResponse>
}

export class BraspagPixPaymentService implements PixPaymentService {
  constructor(
    private configService: PaymentConfigurationService,
    private storageService: PaymentStorage,
    private clientFactory: BraspagClientFactory,
    private vtexContext: IOContext,
    private logger: PaymentConnectorLogger
  ) {}

  public async cancelPayment(
    request: CancellationRequest
  ): Promise<CancellationResponse> {
    const operationLogger = this.logger.forOperation('CANCEL')

    try {
      operationLogger.info('Starting PIX cancellation', {
        paymentId: request.paymentId,
      })

      // Get stored payment
      const storedPayment = await this.getStoredPixPayment(request.paymentId)

      // Get current status from Braspag
      const currentStatus = await this.queryPaymentStatus(
        storedPayment.pixPaymentId
      )

      // Handle cancellation based on status
      return this.handleCancellationByStatus(request, currentStatus)
    } catch (error) {
      operationLogger.error('PIX cancellation failed', error)

      return Cancellations.deny(request, {
        code: ERROR_CODES.ERROR,
        message: `PIX cancellation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public async settlePayment(
    request: SettlementRequest
  ): Promise<SettlementResponse> {
    const operationLogger = this.logger.forOperation('SETTLE')

    try {
      operationLogger.info('Starting PIX settlement', {
        paymentId: request.paymentId,
        tid: request.tid,
      })

      if (!request.tid) {
        throw new Error(RESPONSE_MESSAGES.TID_REQUIRED)
      }

      // Validate that stored payment exists and is PIX type
      await this.getStoredPixPayment(request.paymentId)

      // Get current status from Braspag
      const currentStatus = await this.queryPaymentStatus(request.tid)

      // Handle settlement based on status
      return this.handleSettlementByStatus(request, currentStatus)
    } catch (error) {
      operationLogger.error('PIX settlement failed', error)

      return Settlements.deny(request, {
        code: ERROR_CODES.ERROR,
        message: `PIX settlement failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  private async getStoredPixPayment(
    paymentId: string
  ): Promise<StoredBraspagPayment> {
    const storedPayment = await this.storageService.getStoredPayment(paymentId)

    if (!storedPayment || storedPayment.type !== PAYMENT_TYPES.PIX) {
      throw new Error(RESPONSE_MESSAGES.PIX_PAYMENT_NOT_FOUND)
    }

    return storedPayment
  }

  private async queryPaymentStatus(paymentId: string) {
    const merchantSettings = this.configService.getMerchantSettingsFromEnv()
    const braspagClient = this.clientFactory.createClient(
      this.vtexContext,
      merchantSettings
    )

    const paymentStatus = await braspagClient.queryPixPaymentStatus(paymentId)

    return paymentStatus.Payment
  }

  private async handleCancellationByStatus(
    request: CancellationRequest,
    payment: BraspagPayment
  ): Promise<CancellationResponse> {
    switch (payment.Status) {
      case BRASPAG_STATUS.PAID:
        return Cancellations.deny(request, {
          code: ERROR_CODES.PAID,
          message: RESPONSE_MESSAGES.PIX_CANNOT_CANCEL_PAID,
        })

      case BRASPAG_STATUS.VOIDED:
        return Cancellations.approve(request, {
          cancellationId: payment.PaymentId,
          code: payment.Status?.toString() ?? '10',
          message: RESPONSE_MESSAGES.PIX_ALREADY_CANCELLED,
        })

      case BRASPAG_STATUS.ABORTED:
        return Cancellations.approve(request, {
          cancellationId: payment.PaymentId,
          code: payment.Status?.toString() ?? '10',
          message: RESPONSE_MESSAGES.PIX_ALREADY_CANCELLED,
        })

      case BRASPAG_STATUS.PENDING:
        // Update stored payment status
        await this.storageService.updatePaymentStatus(
          request.paymentId,
          BRASPAG_STATUS.VOIDED
        )

        return Cancellations.approve(request, {
          cancellationId: payment.PaymentId,
          code: BRASPAG_STATUS.VOIDED.toString(),
          message: RESPONSE_MESSAGES.PIX_CANCELLED,
        })

      case BRASPAG_STATUS.SCHEDULED:
        // Update stored payment status
        await this.storageService.updatePaymentStatus(
          request.paymentId,
          BRASPAG_STATUS.VOIDED
        )

        return Cancellations.approve(request, {
          cancellationId: payment.PaymentId,
          code: BRASPAG_STATUS.VOIDED.toString(),
          message: RESPONSE_MESSAGES.PIX_CANCELLED,
        })

      default:
        return Cancellations.deny(request, {
          code: payment.Status?.toString() ?? ERROR_CODES.UNKNOWN,
          message: `PIX payment cannot be cancelled. Status: ${payment.Status}`,
        })
    }
  }

  private handleSettlementByStatus(
    request: SettlementRequest,
    payment: BraspagPayment
  ): SettlementResponse {
    switch (payment.Status) {
      case BRASPAG_STATUS.PAID:
        return Settlements.approve(request, {
          settleId: payment.PaymentId,
          code: payment.Status.toString(),
          message: RESPONSE_MESSAGES.PIX_SETTLED,
        })

      case BRASPAG_STATUS.DENIED:
        return Settlements.deny(request, {
          code: payment.Status?.toString() ?? ERROR_CODES.DENIED,
          message: `${RESPONSE_MESSAGES.PIX_CANNOT_SETTLE}. Status: ${payment.Status}`,
        })

      case BRASPAG_STATUS.VOIDED:
        return Settlements.deny(request, {
          code: payment.Status?.toString() ?? ERROR_CODES.DENIED,
          message: `${RESPONSE_MESSAGES.PIX_CANNOT_SETTLE}. Status: ${payment.Status}`,
        })

      case BRASPAG_STATUS.ABORTED:
        return Settlements.deny(request, {
          code: payment.Status?.toString() ?? ERROR_CODES.DENIED,
          message: `${RESPONSE_MESSAGES.PIX_CANNOT_SETTLE}. Status: ${payment.Status}`,
        })

      default:
        return Settlements.deny(request, {
          code: payment.Status?.toString() ?? ERROR_CODES.PENDING,
          message: `${RESPONSE_MESSAGES.PIX_NOT_READY_FOR_SETTLEMENT}. Status: ${payment.Status}`,
        })
    }
  }
}

/**
 * Factory for creating PIX payment service instances
 */
export class PixPaymentServiceFactory {
  public static create(
    configService: PaymentConfigurationService,
    storageService: PaymentStorage,
    clientFactory: BraspagClientFactory,
    vtexContext: IOContext,
    logger: PaymentConnectorLogger
  ): PixPaymentService {
    return new BraspagPixPaymentService(
      configService,
      storageService,
      clientFactory,
      vtexContext,
      logger
    )
  }
}
