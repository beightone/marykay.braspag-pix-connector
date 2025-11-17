import { IOContext } from '@vtex/api'
import {
  CancellationRequest,
  CancellationResponse,
  SettlementRequest,
  SettlementResponse,
} from '@vtex/payment-provider'

import { PaymentConfigurationService } from '../payment-configuration'
import { VBasePaymentStorageService } from '../payment-storage'
import { BraspagClientFactory } from '../braspag-client-factory/types'
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'
import { BraspagQueryClient } from '../../clients/braspag-query'

export interface PixOperationsService {
  cancelPayment(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse>
  settlePayment(settlement: SettlementRequest): Promise<SettlementResponse>
}

export interface PixOperationsServiceDependencies {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  queryClient: BraspagQueryClient
  context: IOContext
  logger: DatadogCompatibleLogger
  ordersClient?: {
    getOrder: (orderId: string) => Promise<any>
    cancelOrderInVtex: (orderId: string, reason?: string) => Promise<void>
  }
  giftcardsClient?: {
    createRefundVoucher: (request: {
      userId: string
      refundValue: number
      orderId: string
    }) => Promise<{ giftCardId: string; redemptionCode: string }>
  }
}

export interface PixOperationsServiceFactoryParams {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  queryClient: BraspagQueryClient
  context: IOContext
  logger: DatadogCompatibleLogger
  ordersClient?: {
    getOrder: (orderId: string) => Promise<any>
    cancelOrderInVtex: (orderId: string, reason?: string) => Promise<void>
  }
  giftcardsClient?: {
    createRefundVoucher: (request: {
      userId: string
      refundValue: number
      orderId: string
    }) => Promise<{ giftCardId: string; redemptionCode: string }>
  }
}
