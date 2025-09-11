import { IOContext } from '@vtex/api'
import {
  CancellationRequest,
  CancellationResponse,
  SettlementRequest,
  SettlementResponse,
} from '@vtex/payment-provider'

import { StructuredLogger } from '../../utils/structured-logger'
import { PaymentConfigurationService } from '../payment-configuration'
import { VBasePaymentStorageService } from '../payment-storage'
import { BraspagClientFactory } from '../braspag-client-factory/types'

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
  context: IOContext
  logger: StructuredLogger
}

export interface PixOperationsServiceFactoryParams {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  context: IOContext
  logger: StructuredLogger
}
