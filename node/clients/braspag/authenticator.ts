/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-console */
import { BraspagConfig } from './config'
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'
import { AuthenticateResponse } from './types'

export class BraspagAuthenticator {
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null

  constructor(
    private config: BraspagConfig,
    private httpClient: {
      postRaw: <T>(
        url: string,
        data: string,
        options: { headers: Record<string, string> }
      ) => Promise<{ data: T }>
    },
    private logger: DatadogCompatibleLogger
  ) {}

  public async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.accessToken!
    }

    return this.authenticate()
  }

  private isTokenValid(): boolean {
    return (
      this.accessToken !== null &&
      this.tokenExpiry !== null &&
      this.tokenExpiry.getTime() > Date.now()
    )
  }

  private async authenticate(): Promise<string> {
    const { authUrl } = this.config.environment
    const { merchantId, clientSecret } = this.config.credentials

    this.logger.info('BRASPAG: Starting authentication', {
      authUrl,
      merchantId,
      environment: this.config.isProduction ? 'production' : 'sandbox',
    })

    const basicAuth = Buffer.from(`${merchantId}:${clientSecret}`).toString(
      'base64'
    )

    try {
      const response = await this.httpClient.postRaw<AuthenticateResponse>(
        authUrl,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      )

      const authData = response.data

      this.accessToken = authData.access_token
      this.tokenExpiry = new Date(Date.now() + authData.expires_in * 1000)

      this.logger.info('BRASPAG: Authentication successful', {
        tokenType: authData.token_type,
        expiresIn: authData.expires_in,
      })

      return this.accessToken
    } catch (error) {
      this.logger.error('BRASPAG: Authentication failed', {
        authUrl,
        merchantId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      this.clearToken()

      if (this.isInvalidClientError(error)) {
        throw this.createInvalidClientError(error)
      }

      throw error
    }
  }

  private isInvalidClientError(
    error: unknown
  ): error is {
    response: { data: { error: string; error_description?: string } }
  } {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'response' in error &&
        error.response &&
        typeof error.response === 'object' &&
        'data' in error.response &&
        error.response.data &&
        typeof error.response.data === 'object' &&
        'error' in error.response.data &&
        error.response.data.error === 'invalid_client'
    )
  }

  private createInvalidClientError(error: unknown): Error {
    const errorResponse = error as {
      response: { data: { error_description?: string } }
    }

    const requestIdMatch = errorResponse.response.data.error_description?.match(
      /Request Id[^:]*: ([^.]+)/
    )

    const requestId = requestIdMatch?.[1] ?? 'N/A'
    const environment = this.config.isProduction ? 'production' : 'sandbox'

    return new Error(
      `Braspag authentication failed: Invalid client credentials. ` +
        `Please verify that the merchantId and clientSecret are correct for the ${environment} environment. ` +
        `Request ID: ${requestId}`
    )
  }

  private clearToken(): void {
    this.accessToken = null
    this.tokenExpiry = null
  }

  public getAuthHeaders(): Record<string, string> {
    // if (!this.accessToken) {
    //   throw new Error('No valid access token available')
    // }

    return {
      MerchantId: this.config.credentials.merchantId,
      MerchantKey: this.config.credentials.merchantKey,
    }
  }
}
