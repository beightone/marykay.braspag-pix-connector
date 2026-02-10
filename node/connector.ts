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
import { ServiceContext } from '@vtex/api'

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
import { PixAuthorizationService } from './services/authorization/types'
import { braspagClientFactory } from './services/braspag-client-factory'
import { PixOperationsServiceFactory } from './services/operations'
import { PixOperationsService } from './services/operations/types'

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

  private readonly pixAuthService: PixAuthorizationService
  private readonly pixOpsService: PixOperationsService

  private readonly notificationService: NotificationService

  constructor(
    context: ServiceContext<Clients, PaymentProviderState, CustomContextFields>
  ) {
    super(context)
    this.datadogLogger = new Logger(
      this.context as Context,
      this.context.clients.datadog
    )

    this.logger = new DatadogLoggerAdapter(this.datadogLogger)
    this.notificationService = new NotificationService(this.logger)
    this.notificationService.addHandler(
      new BraspagNotificationHandler(this.logger)
    )

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
      queryClient: this.context.clients.braspagQuery,
      context: this.context.vtex,
      logger: this.logger,
      ordersClient: {
        getOrder: this.context.clients.orders.getOrder.bind(
          this.context.clients.orders
        ),
        cancelOrderInVtex: this.context.clients.orders.cancelOrderInVtex.bind(
          this.context.clients.orders
        ),
      },
    })
  }

  public async authorize(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
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

        try {
          this.callback(authorization, response)
        } catch (error) {
          this.logger.warn('[PIX_AUTH] Test callback ping failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      return executeAuthorization(authorization, response => {
        onRetry(response)
      })
    }

    this.logger.info('[PIX_AUTH] Authorization request received', {
      flow: 'authorization',
      action: 'authorization_started',
      paymentId: authorization.paymentId,
      orderId: authorization.orderId,
      transactionId: authorization.transactionId,
      valueBRL: authorization.value,
      callbackUrl: authorization.callbackUrl,
    })

    try {
      const result = await this.pixAuthService.authorizePixPayment(
        authorization
      )

      return result
    } catch (error) {
      this.logger.error('[PIX_AUTH] Authorization failed', {
        flow: 'authorization',
        action: 'authorization_failed',
        paymentId: authorization.paymentId,
        orderId: authorization.orderId,
        valueBRL: authorization.value,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

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

    try {
      return await this.pixOpsService.cancelPayment(cancellation)
    } catch (error) {
      this.logger.error('[PIX_CANCEL] Unhandled cancellation error', {
        flow: 'cancellation',
        action: 'unhandled_error',
        paymentId: cancellation.paymentId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      return Cancellations.deny(cancellation, {
        code: ERROR_CODES.ERROR,
        message: `PIX cancellation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public async refund(refund: RefundRequest): Promise<RefundResponse> {
    if (this.isTestSuite) {
      return Refunds.deny(refund)
    }

    const startTime = Date.now()

    try {
      const storedPayment = await this.storageService.getStoredPayment(
        refund.paymentId
      )

      if (!storedPayment || storedPayment.type !== 'pix') {
        this.logger.warn('[PIX_REFUND] Payment not found in storage', {
          flow: 'refund',
          action: 'payment_not_found',
          paymentId: refund.paymentId,
          paymentFound: !!storedPayment,
          paymentType: storedPayment?.type,
        })

        return Refunds.deny(refund)
      }

      this.logger.info('[PIX_REFUND] Refund started', {
        flow: 'refund',
        action: 'refund_started',
        paymentId: refund.paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        amountCents: storedPayment.amount,
        braspagStatus: storedPayment.status,
      })

      const extended = (refund as unknown) as {
        merchantSettings?: Array<{ name: string; value: string }>
      }

      const merchantSettings = this.configService.getMerchantSettings({
        merchantSettings: extended.merchantSettings,
        paymentId: refund.paymentId,
      })

      const braspagClient = braspagClientFactory.createClient(
        this.context.vtex,
        merchantSettings
      )

      const voidResponse = await braspagClient.voidPixPayment(
        storedPayment.pixPaymentId
      )

      await this.storageService.updatePaymentStatus(refund.paymentId, 11)

      this.logger.info('[PIX_REFUND] Refund approved', {
        flow: 'refund',
        action: 'refund_approved',
        paymentId: refund.paymentId,
        pixPaymentId: storedPayment.pixPaymentId,
        orderId: storedPayment.orderId,
        braspagVoidStatus: voidResponse.Status,
        durationMs: Date.now() - startTime,
      })

      return Refunds.approve(refund, {
        refundId: storedPayment.pixPaymentId,
        code: (voidResponse.Status ?? 11).toString(),
        message: 'PIX total refund requested successfully',
      })
    } catch (error) {
      this.logger.error('[PIX_REFUND] Refund failed', {
        flow: 'refund',
        action: 'refund_failed',
        paymentId: refund.paymentId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: Date.now() - startTime,
      })

      return Refunds.deny(refund)
    }
  }

  public async settle(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    if (this.isTestSuite) {
      return Settlements.deny(settlement)
    }

    return this.pixOpsService.settlePayment(settlement)
  }

  public inbound = async (request: any): Promise<any> => {
    this.logger.info('[WEBHOOK] Braspag notification received', {
      flow: 'webhook',
      action: 'inbound_received',
      paymentId: request.body?.PaymentId,
      changeType: request.body?.ChangeType,
      status: request.body?.Status,
      merchantOrderId: request.body?.MerchantOrderId,
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
      vtex: { account: this.context.vtex.account },
      clients: {
        vbase: vbaseClient,
        braspag: {
          queryPixStatus: (paymentId: string) =>
            this.context.clients.braspagQuery.getTransactionByPaymentId(
              paymentId
            ),
          voidPixPayment: async (paymentId: string) => {
            const braspagClient = braspagClientFactory.createClient(
              this.context.vtex
            )

            return braspagClient.voidPixPayment(paymentId)
          },
        },
        retry: {
          ping: async (url: string) => {
            return this.context.clients.vtexGateway.pingRetryCallback(url)
          },
        },
      },
      request: { body: request.body },
    }

    return this.notificationService.processNotification(
      request.body,
      notificationContext as any
    )
  }
}
