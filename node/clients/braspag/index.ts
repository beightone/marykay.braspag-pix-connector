import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import {
  CreatePixSaleRequest,
  CreatePixSaleResponse,
  QueryPixStatusResponse,
  VoidPixResponse,
} from './types'
import {
  BraspagConfig,
  BraspagConfigBuilder,
  BraspagCredentials,
} from './config'
import { BraspagAuthenticator } from './authenticator'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { Logger as DatadogLogger } from '../../tools/datadog/datadog'
import { Datadog } from '../datadog'

export class BraspagClient extends ExternalClient {
  private config: BraspagConfig
  private authenticator: BraspagAuthenticator
  private logger: DatadogLoggerAdapter

  constructor(
    context: IOContext & { settings?: BraspagCredentials },
    options?: InstanceOptions
  ) {
    const isProduction = context.workspace === 'master'
    const credentials = context.settings
    const config = BraspagConfigBuilder.build(credentials, isProduction)

    super(config.environment.apiUrl, context, {
      timeout: 30000,
      ...options,
      headers: {
        ...options?.headers,
      },
    })

    this.config = config

    const datadogClient = new Datadog(context, options)
    const datadogLogger = new DatadogLogger(context as any, datadogClient)

    this.logger = new DatadogLoggerAdapter(datadogLogger)
    this.authenticator = new BraspagAuthenticator(
      this.config,
      this.http,
      this.logger
    )
  }

  public async createPixSale(
    payload: CreatePixSaleRequest
  ): Promise<CreatePixSaleResponse> {
    const startTime = Date.now()

    try {
      const headers = this.authenticator.getAuthHeaders()

      const response = await this.http.post<CreatePixSaleResponse>(
        '/v2/sales/',
        payload,
        { headers }
      )

      this.logger.info('[BRASPAG] PIX sale created', {
        flow: 'braspag_api',
        action: 'pix_sale_created',
        merchantOrderId: payload.MerchantOrderId,
        pixPaymentId: response.Payment?.PaymentId,
        braspagStatus: response.Payment?.Status,
        amountCents: payload.Payment?.Amount,
        durationMs: Date.now() - startTime,
      })

      return response
    } catch (error) {
      this.logger.error('[BRASPAG] PIX sale creation failed', {
        flow: 'braspag_api',
        action: 'pix_sale_creation_failed',
        merchantOrderId: payload.MerchantOrderId,
        amountCents: payload.Payment?.Amount,
        statusCode: error?.response?.status,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      })

      throw error
    }
  }

  public async queryPixPaymentStatus(
    paymentId: string
  ): Promise<QueryPixStatusResponse> {
    const startTime = Date.now()

    try {
      const headers = this.authenticator.getAuthHeaders()
      const queryApiUrl = 'https://apiquery.braspag.com.br'
      const fullUrl = `${queryApiUrl}/v2/sales/${paymentId}`

      const response = await this.http.get<QueryPixStatusResponse>(fullUrl, {
        headers,
      })

      return response
    } catch (error) {
      const statusCode = error?.response?.status

      if (statusCode === 404) {
        this.logger.warn('[BRASPAG] Payment not found (404)', {
          flow: 'braspag_api',
          action: 'payment_not_found',
          paymentId,
          durationMs: Date.now() - startTime,
        })
        throw new Error(`Payment ${paymentId} not found in Braspag`)
      }

      this.logger.error('[BRASPAG] Payment query failed', {
        flow: 'braspag_api',
        action: 'payment_query_failed',
        paymentId,
        statusCode,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      })
      throw error
    }
  }

  public async voidPixPayment(paymentId: string): Promise<VoidPixResponse> {
    const startTime = Date.now()

    try {
      const headers = this.authenticator.getAuthHeaders()
      const response = await this.http.put<VoidPixResponse>(
        `/v2/sales/${paymentId}/void`,
        {},
        { headers }
      )

      const isSplitError =
        response.ProviderReturnCode === 'BP335' ||
        response.ReasonCode === 37 ||
        response.ReasonMessage === 'SplitTransactionalError'

      if (isSplitError) {
        this.logger.warn('[BRASPAG] Void split transactional error', {
          flow: 'braspag_api',
          action: 'void_split_error',
          paymentId,
          providerReturnCode: response.ProviderReturnCode,
          reasonCode: response.ReasonCode,
          reasonMessage: response.ReasonMessage,
          durationMs: Date.now() - startTime,
        })
      } else {
        this.logger.info('[BRASPAG] Payment voided successfully', {
          flow: 'braspag_api',
          action: 'payment_voided',
          paymentId,
          braspagStatus: response.Status,
          durationMs: Date.now() - startTime,
        })
      }

      return response
    } catch (error) {
      const statusCode = error?.response?.status
      const errorData = error?.response?.data as VoidPixResponse | undefined

      if (errorData) {
        const isSplitError =
          errorData.ProviderReturnCode === 'BP335' ||
          errorData.ReasonCode === 37 ||
          errorData.ReasonMessage === 'SplitTransactionalError'

        if (isSplitError) {
          this.logger.warn('[BRASPAG] Void split error from exception', {
            flow: 'braspag_api',
            action: 'void_split_error_from_exception',
            paymentId,
            providerReturnCode: errorData.ProviderReturnCode,
            reasonCode: errorData.ReasonCode,
            reasonMessage: errorData.ReasonMessage,
            durationMs: Date.now() - startTime,
          })

          return errorData
        }
      }

      this.logger.error('[BRASPAG] Void payment failed', {
        flow: 'braspag_api',
        action: 'void_payment_failed',
        paymentId,
        statusCode,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      })

      throw error
    }
  }
}
