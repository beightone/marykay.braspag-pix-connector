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
  NotificationService,
  BraspagNotificationHandler,
} from './services'
import { PixAuthorizationServiceFactory } from './services/authorization'
import { braspagClientFactory } from './services/braspag-client-factory'
import { PixOperationsServiceFactory } from './services/operations'

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

  private readonly notificationService: NotificationService

  constructor(context: any) {
    super(context)

    // Initialize Datadog logger
    this.datadogLogger = new Logger(
      this.context as Context,
      this.context.clients.datadog
    )

    // Create adapter for services compatibility
    this.logger = new DatadogLoggerAdapter(this.datadogLogger)

    // Initialize services after logger
    this.pixAuthService = PixAuthorizationServiceFactory.create({
      configService: this.configService,
      storageService: this.storageService,
      clientFactory: braspagClientFactory,
      context: this.context.vtex,
      logger: this.logger,
      ordersClient: this.context.clients.orders,
    })

    this.pixOpsService = PixOperationsServiceFactory.create({
      configService: this.configService,
      storageService: this.storageService,
      clientFactory: braspagClientFactory,
      context: this.context.vtex,
      logger: this.logger,
    })

    this.notificationService = new NotificationService(this.logger)
    this.notificationService.addHandler(
      new BraspagNotificationHandler(this.logger)
    )
  }

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
    this.logger.info('AUTHORIZE: Received request', { authorization })

    if (this.isTestSuite) {
      const persisted = (await this.context.clients.vbase.getJSON(
        'authorizations',
        authorization.paymentId,
        true
      )) as AuthorizationResponse | undefined

      if (persisted) {
        return persisted
      }

      const onRetry = async (response: AuthorizationResponse) => {
        await this.context.clients.vbase.saveJSON(
          'authorizations',
          response.paymentId,
          response
        )

        this.logger.info('Attempting callback to Test Suite...', {})
        try {
          this.callback(authorization, response)
          this.logger.info('Callback successful', {})
        } catch (error) {
          this.logger.warn(
            'Callback failed (TLS error expected in test environment)',
            { error: error instanceof Error ? error.message : String(error) }
          )
        }
      }

      return executeAuthorization(authorization, response => {
        onRetry(response)
      })
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

    try {
      const storedPayment = await this.storageService.getStoredPayment(
        refund.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        return Refunds.deny(refund)
      }

      const extended = (refund as unknown) as {
        merchantSettings?: Array<{ name: string; value: string }>
      }

      const merchantSettings = this.configService.getMerchantSettings({
        merchantSettings: extended.merchantSettings,
        paymentId: refund.paymentId,
      } as any)

      const braspagClient = braspagClientFactory.createClient(
        this.context.vtex,
        merchantSettings
      )

      const voidResponse = await braspagClient.voidPixPayment(
        storedPayment.pixPaymentId
      )

      await this.storageService.updatePaymentStatus(refund.paymentId, 11)

      return Refunds.approve(refund, {
        refundId: storedPayment.pixPaymentId,
        code: (voidResponse.Status ?? 11).toString(),
        message: 'PIX total refund requested successfully',
      })
    } catch (error) {
      this.logger.error('PIX refund failed', error)

      return Refunds.deny(refund)
    }
  }

  public async settle(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    if (this.isTestSuite) {
      return Settlements.deny(settlement)
    }

    console.log('PIX SETTLEMENT: Processing settlement request', { settlement })
    console.dir(
      { where: 'connector.settle', settlement },
      { depth: null, colors: true }
    )

    return this.pixOpsService.settlePayment(settlement)
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

    const vbaseClient = {
      getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
        this.context.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
      saveJSON: async (bucket: string, key: string, data: unknown) => {
        await this.context.clients.vbase.saveJSON(bucket, key, data)
      },
    }

    const notificationContext = {
      status: 200,
      body: request.body,
      clients: {
        vbase: vbaseClient,
      },
      request: { body: request.body },
    }

    return this.notificationService.processNotification(
      request.body,
      notificationContext as any
    )
  }
}
