import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import {
  AuthenticateResponse,
  CreatePixSaleRequest,
  CreatePixSaleResponse,
  VoidPixRequest,
  VoidPixResponse,
} from './types'

const BRASPAG_API_URL = 'https://api.braspag.com.br'
const BRASPAG_SANDBOX_API_URL = 'https://apisandbox.braspag.com.br'
const BRASPAG_AUTH_URL = 'https://auth.braspag.com.br/oauth2/token'
const BRASPAG_SANDBOX_AUTH_URL =
  'https://authsandbox.braspag.com.br/oauth2/token'

export class BraspagClient extends ExternalClient {
  private merchantId: string
  private clientSecret: string
  private merchantKey: string

  constructor(context: IOContext, options?: InstanceOptions) {
    super(
      context.workspace === 'master'
        ? BRASPAG_API_URL
        : BRASPAG_SANDBOX_API_URL,
      context,
      {
        ...options,
        headers: {
          'X-Vtex-Use-Https': 'true',
        },
      }
    )

    this.merchantId = context.settings.merchantId
    this.clientSecret = context.settings.clientSecret
    this.merchantKey = context.settings.merchantKey
  }

  public async authenticate(): Promise<AuthenticateResponse> {
    const authUrl =
      this.context.workspace === 'master'
        ? BRASPAG_AUTH_URL
        : BRASPAG_SANDBOX_AUTH_URL

    const basicAuth = Buffer.from(
      `${this.merchantId}:${this.clientSecret}`
    ).toString('base64')

    try {
      const response = await this.http.post<AuthenticateResponse>(
        authUrl,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      return response
    } catch (error) {
      const { logger } = this.context as any

      logger?.error('BRASPAG_AUTHENTICATION_FAILED', {
        authUrl,
        merchantId: this.merchantId,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = await this.authenticate()

    return {
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
      MerchantId: this.merchantId,
      MerchantKey: this.merchantKey,
    }
  }

  public async createPixSale(
    payload: CreatePixSaleRequest
  ): Promise<CreatePixSaleResponse> {
    const { logger } = this.context as any

    try {
      const headers = await this.getAuthHeaders()

      logger?.info('BRASPAG_CREATE_PIX_SALE_REQUEST', {
        merchantOrderId: payload.MerchantOrderId,
        amount: payload.Payment?.Amount,
        splitPayments: payload.Payment?.SplitPayments?.length ?? 0,
      })

      const response = await this.http.post<CreatePixSaleResponse>(
        '/v2/sales/',
        payload,
        { headers }
      )

      logger?.info('BRASPAG_CREATE_PIX_SALE_SUCCESS', {
        merchantOrderId: payload.MerchantOrderId,
        paymentId: response.Payment?.PaymentId,
        status: response.Payment?.Status,
      })

      return response
    } catch (error) {
      logger?.error('BRASPAG_CREATE_PIX_SALE_FAILED', {
        merchantOrderId: payload.MerchantOrderId,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }

  public async voidPixPayment(
    paymentId: string,
    payload: VoidPixRequest
  ): Promise<VoidPixResponse> {
    const { logger } = this.context as any

    try {
      const headers = await this.getAuthHeaders()

      logger?.info('BRASPAG_VOID_PIX_PAYMENT_REQUEST', {
        paymentId,
        amount: payload.Amount,
      })

      const response = await this.http.put<VoidPixResponse>(
        `/v2/sales/${paymentId}/void`,
        payload,
        { headers }
      )

      logger?.info('BRASPAG_VOID_PIX_PAYMENT_SUCCESS', {
        paymentId,
        status: response.Status,
        returnCode: response.ReturnCode,
      })

      return response
    } catch (error) {
      logger?.error('BRASPAG_VOID_PIX_PAYMENT_FAILED', {
        paymentId,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }
}
