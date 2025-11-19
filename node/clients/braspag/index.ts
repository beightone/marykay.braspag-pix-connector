/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
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
        paymentId: response.Payment?.PaymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      this.logger.error('[BRASPAG] PIX sale creation failed', {
        flow: 'braspag_api',
        action: 'pix_sale_creation_failed',
        merchantOrderId: payload.MerchantOrderId,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  public async queryPixPaymentStatus(
    paymentId: string
  ): Promise<QueryPixStatusResponse> {
    try {
      const headers = this.authenticator.getAuthHeaders()
      const queryApiUrl = 'https://apiquery.braspag.com.br'
      const fullUrl = `${queryApiUrl}/v2/sales/${paymentId}`

      const response = await this.http.get<QueryPixStatusResponse>(fullUrl, {
        headers,
      })

      this.logger.info('[BRASPAG] Payment status queried', {
        flow: 'braspag_api',
        action: 'payment_status_queried',
        paymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      const statusCode = error?.response?.status

      if (statusCode === 404) {
        this.logger.warn('[BRASPAG] Payment not found', {
          flow: 'braspag_api',
          action: 'payment_not_found',
          paymentId,
          statusCode,
        })
        throw new Error(`Payment ${paymentId} not found in Braspag`)
      }

      this.logger.error('[BRASPAG] Payment status query failed', {
        flow: 'braspag_api',
        action: 'payment_status_query_failed',
        paymentId,
        statusCode,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  public async voidPixPayment(paymentId: string): Promise<VoidPixResponse> {
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
        this.logger.warn('[BRASPAG] Void returned split error', {
          flow: 'braspag_api',
          action: 'void_split_error',
          paymentId,
          providerReturnCode: response.ProviderReturnCode,
          reasonCode: response.ReasonCode,
          reasonMessage: response.ReasonMessage,
        })
      } else {
        this.logger.info('[BRASPAG] Payment voided successfully', {
          flow: 'braspag_api',
          action: 'payment_voided',
          paymentId,
          status: response.Status,
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
          this.logger.warn('[BRASPAG] Void failed with split error', {
            flow: 'braspag_api',
            action: 'void_split_error_exception',
            paymentId,
            providerReturnCode: errorData.ProviderReturnCode,
            reasonCode: errorData.ReasonCode,
            reasonMessage: errorData.ReasonMessage,
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
      })

      throw error
    }
  }
}
