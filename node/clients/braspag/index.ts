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
    // Build configuration first
    const credentials: BraspagCredentials = context.settings || {
      merchantId: 'E28449FA-1268-42BF-B4D3-313BF447285E',
      clientSecret: 'q2R/Ya3zlXFWQ9Ar8FylNbbIyhFJAKvw+eEknMsKTD8=',
      merchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',
    }

    const isProduction = context.workspace === 'master'
    const config = BraspagConfigBuilder.build(credentials, isProduction)

    super(config.environment.apiUrl, context, {
      ...options,
      headers: {
        'X-Vtex-Use-Https': 'true',
        'VTEX-API-Is-TestSuite': 'true',
      },
    })

    // Initialize instance properties
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
        hasQrCode: !!response.Payment?.QrCodeString,
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
