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

    this.logger.info('BRASPAG: Client initialized', {
      merchantId: credentials.merchantId,
      environment: isProduction ? 'production' : 'sandbox',
      apiUrl: this.config.environment.apiUrl,
    })
  }

  public async createPixSale(
    payload: CreatePixSaleRequest
  ): Promise<CreatePixSaleResponse> {
    const operation = 'CREATE_PIX_SALE'

    this.logger.info(`BRASPAG: Starting ${operation}`, { payload })

    try {
      // await this.authenticator.getAccessToken()
      const headers = this.authenticator.getAuthHeaders()

      const response = await this.http.post<CreatePixSaleResponse>(
        '/v2/sales/',
        payload,
        { headers }
      )

      this.logger.info(`BRASPAG: ${operation} successful`, {
        merchantOrderId: payload.MerchantOrderId,
        paymentId: response.Payment?.PaymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      this.logger.error(`BRASPAG: ${operation} failed`, error, {
        merchantOrderId: payload.MerchantOrderId,
      })

      throw error
    }
  }

  public async queryPixPaymentStatus(
    paymentId: string
  ): Promise<QueryPixStatusResponse> {
    const operation = 'QUERY_PIX_STATUS'

    this.logger.info(`BRASPAG: Starting ${operation}`, { paymentId })

    try {
      // await this.authenticator.getAccessToken()
      const headers = this.authenticator.getAuthHeaders()

      const response = await this.http.get<QueryPixStatusResponse>(
        `/v2/sales/${paymentId}`,
        { headers }
      )

      this.logger.info(`BRASPAG: ${operation} successful`, {
        paymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      const statusCode = error?.response?.status

      if (statusCode === 404) {
        this.logger.warn(`BRASPAG: ${operation} - Payment not found`, {
          paymentId,
          statusCode,
        })
        throw new Error(`Payment ${paymentId} not found in Braspag`)
      }

      this.logger.error(`BRASPAG: ${operation} failed`, error, {
        paymentId,
        statusCode,
      })
      throw error
    }
  }

  public async voidPixPayment(paymentId: string): Promise<VoidPixResponse> {
    const operation = 'VOID_PIX_PAYMENT'

    this.logger.info(`BRASPAG: Starting ${operation}`, { paymentId })
    try {
      const headers = this.authenticator.getAuthHeaders()
      const response = await this.http.put<VoidPixResponse>(
        `/v2/sales/${paymentId}/void`,
        {},
        { headers }
      )

      this.logger.info(`BRASPAG: ${operation} successful`, {
        paymentId,
        status: response.Status,
      })

      return response
    } catch (error) {
      const statusCode = error?.response?.status

      this.logger.error(`BRASPAG: ${operation} failed`, error, {
        paymentId,
        statusCode,
      })
      throw error
    }
  }
}
