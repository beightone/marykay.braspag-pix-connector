import { IOContext } from '@vtex/api'
import {
  AuthorizationRequest,
  AuthorizationResponse,
} from '@vtex/payment-provider'

import { PaymentConfigurationService } from '../payment-configuration'
import { VBasePaymentStorageService } from '../payment-storage'
import { BraspagClientFactory } from '../braspag-client-factory/types'
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'
import { OMSClient } from '../../clients/orders'
import { BraspagQueryClient } from '../../clients/braspag-query'

export interface PixAuthorizationService {
  authorizePixPayment(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse>
}

export interface PixAuthorizationServiceDependencies {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  queryClient?: BraspagQueryClient
  context: IOContext & {
    settings?: {
      hublyApiKey?: string
      hublyOrganizationId?: string
    }
  }
  logger: DatadogCompatibleLogger
  ordersClient: OMSClient
}

// Removed unused ExtendedAuthorizationRequest and BraspagPayment interfaces

export interface PixAuthorizationServiceFactoryParams {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  queryClient?: BraspagQueryClient
  context: IOContext & {
    settings?: {
      hublyApiKey?: string
      hublyOrganizationId?: string
    }
  }
  logger: DatadogCompatibleLogger
  ordersClient: OMSClient
}
