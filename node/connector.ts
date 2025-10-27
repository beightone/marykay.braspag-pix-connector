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
import { Logger } from './tools/datadog/datadog'
import { DatadogLoggerAdapter } from './tools/datadog/logger-adapter'
import { ERROR_CODES } from './constants/payment-constants'
import {
  PaymentConfigurationServiceFactory,
  PaymentStorageServiceFactory,
  WebhookInboundServiceFactory,
} from './services'
import { PixAuthorizationServiceFactory } from './services/authorization'
import { braspagClientFactory } from './services/braspag-client-factory'
import { PixOperationsServiceFactory } from './services/operations'
import { AuthorizationRequestWithSplits } from './types/connector'

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
  private readonly datadogLogger: Logger
  private readonly logger: DatadogLoggerAdapter
  private readonly configService = PaymentConfigurationServiceFactory.create()

  private readonly storageService = PaymentStorageServiceFactory.createPaymentStorage(
    this.context.clients.vbase
  )

  private readonly pixAuthService: any

  private readonly pixOpsService: any

  private readonly webhookService: any

  constructor(context: any) {
    super(context)

    // Initialize Datadog logger
    this.datadogLogger = new Logger(
      this.context as Context,
      this.context.clients.datadog
    )

    // Create adapter for services compatibility
    this.logger = new DatadogLoggerAdapter(this.datadogLogger)

    // Set logger on braspag client factory
    braspagClientFactory.setLogger(this.logger)

    // Initialize services after logger
    this.pixAuthService = PixAuthorizationServiceFactory.create({
      configService: this.configService,
      storageService: this.storageService,
      clientFactory: braspagClientFactory,
      context: this.context.vtex,
      logger: this.logger,
    })

    this.pixOpsService = PixOperationsServiceFactory.create({
      configService: this.configService,
      storageService: this.storageService,
      clientFactory: braspagClientFactory,
      context: this.context.vtex,
      logger: this.logger,
    })

    this.webhookService = WebhookInboundServiceFactory.create(
      this.datadogLogger
    )
  }

  public async authorize(
    authorization: AuthorizationRequestWithSplits
  ): Promise<AuthorizationResponse> {
    if (this.isTestSuite) {
      const persistedResponse = await getPersistedAuthorizationResponse(
        this.context.clients.vbase,
        authorization
      )

      if (persistedResponse) {
        return persistedResponse
      }

      this.logger.info('No persisted response found, executing flow', {})

      return executeAuthorization(authorization, response =>
        this.saveAndRetry(authorization, response)
      )
    }

    try {
      return await this.pixAuthService.authorizePixPayment(authorization)
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

    this.logger.info('Attempting callback to Test Suite...', {})
    try {
      this.callback(req, resp)
      this.logger.info('Callback successful', {})
    } catch (error) {
      this.logger.warn(
        'Callback failed (TLS error expected in test environment)',
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Inbound webhook handler for receiving Braspag notifications
   * Processes payment status changes and triggers appropriate actions
   */
  public inbound = async (request: any): Promise<any> => {
    this.logger.info('INBOUND: Webhook received', {
      body: request.body,
      headers: request.headers,
    })

    // Create VBase client adapter
    const vbaseClient = {
      getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
        this.context.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
      saveJSON: async (bucket: string, key: string, data: unknown) => {
        await this.context.clients.vbase.saveJSON(bucket, key, data)
      },
    }

    // Delegate to webhook service
    return this.webhookService.processWebhook(request, vbaseClient)
  }
}
