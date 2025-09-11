/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
import {
  AuthorizationRequest,
  AuthorizationResponse,
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  PaymentProvider,
  PaymentProviderState,
  RefundRequest,
  RefundResponse,
  Refunds,
  SettlementRequest,
  SettlementResponse,
  Settlements,
  Authorizations,
} from '@vtex/payment-provider'

import { randomString } from './utils'
import { executeAuthorization } from './flow'
import { Clients } from './clients'
import { PaymentConfigurationServiceFactory } from './services/payment-configuration-service'
import { PaymentStorageServiceFactory } from './services/payment-storage-service'
import { braspagClientFactory } from './services/braspag-client-factory'
import { PixOperationsServiceFactory } from './services/pix-operations-service'
import { LoggerFactory } from './utils/structured-logger'
import { ERROR_CODES, RESPONSE_MESSAGES } from './constants/payment-constants'
import { PixAuthorizationServiceFactory } from './services/pix-authorization-service'

const authorizationsBucket = 'authorizations'
const persistAuthorizationResponse = async (
  vbase: any,
  resp: AuthorizationResponse
) => vbase.saveJSON(authorizationsBucket, resp.paymentId, resp)

const getPersistedAuthorizationResponse = async (
  vbase: any,
  req: AuthorizationRequest
) =>
  vbase.getJSON(authorizationsBucket, req.paymentId, true) as Promise<
    AuthorizationResponse | undefined
  >

export default class BraspagConnector extends PaymentProvider<
  Clients,
  PaymentProviderState,
  CustomContextFields
> {
  private readonly logger = LoggerFactory.createLogger('CONNECTOR')
  private readonly configService = PaymentConfigurationServiceFactory.create()
  private readonly storageService = PaymentStorageServiceFactory.createPaymentStorage(
    this.context.clients.vbase
  )

  private readonly pixAuthService = PixAuthorizationServiceFactory.create({
    configService: this.configService,
    storageService: this.storageService,
    clientFactory: braspagClientFactory,
    context: this.context.vtex,
    logger: this.logger,
  })

  private readonly pixOpsService = PixOperationsServiceFactory.create({
    configService: this.configService,
    storageService: this.storageService,
    clientFactory: braspagClientFactory,
    context: this.context.vtex,
    logger: this.logger,
  })

  public async authorize(
    authorization: AuthorizationRequest & {
      paymentMethod?: string
      splits?: Array<{
        merchantId: string
        amount: number
        commission?: {
          fee?: number
          gateway?: number
        }
      }>
    }
  ): Promise<AuthorizationResponse> {
    this.logger.info('Authorize called', {
      paymentId: authorization.paymentId,
      paymentMethod: authorization.paymentMethod,
      isTestSuite: this.isTestSuite,
    })

    if (this.isTestSuite) {
      return this.handleTestSuiteAuthorization(authorization)
    }

    return this.handleProductionAuthorization(authorization)
  }

  public async cancel(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse> {
    if (this.isTestSuite) {
      return Cancellations.approve(cancellation, {
        cancellationId: randomString(),
      })
    }

    return this.pixOpsService.cancelPayment(cancellation)
  }

  public async refund(refund: RefundRequest): Promise<RefundResponse> {
    if (this.isTestSuite) {
      return Refunds.deny(refund)
    }

    throw new Error('Not implemented')
  }

  public async settle(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    if (this.isTestSuite) {
      return Settlements.deny(settlement)
    }

    return this.pixOpsService.settlePayment(settlement)
  }

  private async saveAndRetry(
    req: AuthorizationRequest,
    resp: AuthorizationResponse
  ) {
    await persistAuthorizationResponse(this.context.clients.vbase, resp)

    this.logger.info('Attempting callback to Test Suite...')
    try {
      this.callback(req, resp)
      this.logger.info('Callback successful')
    } catch (error) {
      this.logger.warn(
        'Callback failed (TLS error expected in test environment)',
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  private async handleTestSuiteAuthorization(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    const persistedResponse = await getPersistedAuthorizationResponse(
      this.context.clients.vbase,
      authorization
    )

    if (persistedResponse) {
      return persistedResponse
    }

    this.logger.info('No persisted response found, executing flow')

    return executeAuthorization(authorization, response =>
      this.saveAndRetry(authorization, response)
    )
  }

  private async handleProductionAuthorization(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    try {
      if (!this.isPixPayment(authorization)) {
        throw new Error(RESPONSE_MESSAGES.PAYMENT_METHOD_NOT_SUPPORTED)
      }

      return this.pixAuthService.authorizePixPayment(authorization)
    } catch (error) {
      this.logger.error('PIX authorization failed', error)

      return Authorizations.deny(authorization, {
        code: ERROR_CODES.ERROR,
        message: `PIX authorization failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  private isPixPayment(authorization: AuthorizationRequest): boolean {
    return (
      (authorization as any).paymentMethod === 'Pix' ||
      (authorization as any).miniCart?.paymentMethod === 'Pix'
    )
  }

  public inbound: undefined
}
