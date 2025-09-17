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
    const credentials: BraspagCredentials = context.settings || {
      merchantId: '85c49198-837a-423c-89d0-9087b5d16d49',
      clientSecret: 'Dbmrh40sM/ne/3fVmLVkicGdndGY5zFgUNnMJ9seBMM=',
      merchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',
    }

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
      // const headers = this.authenticator.getAuthHeaders()

      const response = await this.http.post<CreatePixSaleResponse>(
        '/v2/sales/',
        payload,
        {
          headers: {
            MerchantId: '85C49198-837A-423C-89D0-9087B5D16D49',
            MerchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',
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
