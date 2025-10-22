/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import {
  CreatePixSaleRequest,
  CreatePixSaleResponse,
  QueryPixStatusResponse,
} from './types'
import {
  BraspagConfig,
  BraspagConfigBuilder,
  BraspagCredentials,
} from './config'
import { BraspagAuthenticator } from './authenticator'
import { Logger, VtexLogger } from './logger'

export class BraspagClient extends ExternalClient {
  private config: BraspagConfig
  private authenticator: BraspagAuthenticator
  private logger: Logger

  constructor(
    context: IOContext & { settings?: BraspagCredentials },
    options?: InstanceOptions
  ) {
    if (!context.settings?.merchantId || !context.settings?.clientSecret || !context.settings?.merchantKey) {
      throw new Error('Missing required Braspag credentials in settings. Please configure merchantId, merchantKey and clientSecret.')
    }

    const credentials: BraspagCredentials = context.settings

    const isProduction = context.workspace === 'master'
    const config = BraspagConfigBuilder.build(credentials, isProduction)

    super(config.environment.apiUrl, context, {
      timeout: 30000, // TODO verificar tempo limite adequado com a braspag
      ...options,
      headers: {
        ...options?.headers,
      },
    })

    this.config = config
    this.logger = new VtexLogger((context as any).logger)
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

    this.logger.info(`BRASPAG: Starting ${operation}`, {
      merchantOrderId: payload.MerchantOrderId,
      amount: payload.Payment?.Amount,
      splitPaymentsCount: payload.Payment?.SplitPayments?.length ?? 0,
    })

    try {
      await this.authenticator.getAccessToken()

      const response = await this.http.post<CreatePixSaleResponse>(
        '/v2/sales/',
        payload,
        {
          headers: {
            MerchantId: this.config.credentials.merchantId,
            MerchantKey: this.config.credentials.merchantKey,
          },
        }
      )

      this.logger.info(`BRASPAG: ${operation} successful`, {
        merchantOrderId: payload.MerchantOrderId,
        paymentId: response.Payment?.PaymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      this.logger.error(`BRASPAG: ${operation} failed`, {
        merchantOrderId: payload.MerchantOrderId,
        error: error instanceof Error ? error.message : 'Unknown error',
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
      await this.authenticator.getAccessToken()
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
      this.logger.error(`BRASPAG: ${operation} failed`, {
        paymentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
}
