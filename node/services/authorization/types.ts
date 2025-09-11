import { IOContext } from '@vtex/api'
import {
  AuthorizationRequest,
  AuthorizationResponse,
} from '@vtex/payment-provider'

import { StructuredLogger } from '../../utils/structured-logger'
import { PaymentConfigurationService } from '../payment-configuration'
import { VBasePaymentStorageService } from '../payment-storage'
import { BraspagClientFactory } from '../braspag-client-factory/types'

export interface PixAuthorizationService {
  authorizePixPayment(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse>
}

export interface PixAuthorizationServiceDependencies {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  context: IOContext
  logger: StructuredLogger
}

export interface ExtendedAuthorizationRequest {
  merchantSettings?: Record<string, string | number | boolean>
  paymentMethod?: string
  miniCart?: { paymentMethod?: string }
  paymentId: string
  value: number
  currency: string
  callbackUrl: string
  returnUrl: string
  inboundRequestsUrl: string
  reference: string
  orderId: string
}

export interface BraspagPayment {
  PaymentId: string
  Tid?: string
  Status?: number
  QrCodeString?: string
  QrCodeBase64Image?: string
  QrcodeBase64Image?: string
}

export interface PixAuthorizationServiceFactoryParams {
  configService: PaymentConfigurationService
  storageService: VBasePaymentStorageService
  clientFactory: BraspagClientFactory
  context: IOContext
  logger: StructuredLogger
}
