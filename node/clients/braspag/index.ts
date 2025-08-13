import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import { AuthenticateResponse } from './types'

const BRASPAG_SANDBOX_API_URL = 'http://apisandbox.braspag.com.br'
const BRASPAG_AUTH_URL = 'http://auth.braspag.com.br/oauth2/token'
const BRASPAG_SANDBOX_AUTH_URL =
  'https://authsandbox.braspag.com.br/oauth2/token'

export class BraspagClient extends ExternalClient {
  private merchantId: string
  // private merchantKey: string
  private clientSecret: string

  constructor(context: IOContext, options?: InstanceOptions) {
    super(BRASPAG_SANDBOX_API_URL, context, {
      ...options,
      headers: {
        'X-Vtex-Use-Https': 'true',
      },
    })

    this.merchantId = context.settings.merchantId
    // this.merchantKey = context.settings.merchantKey
    this.clientSecret = context.settings.clientSecret
  }

  public async authenticate(): Promise<AuthenticateResponse> {
    const authUrl =
      this.context.workspace === 'master'
        ? BRASPAG_AUTH_URL
        : BRASPAG_SANDBOX_AUTH_URL

    const auth = Buffer.from(
      `${this.merchantId}:${this.clientSecret}`
    ).toString('base64')

    const response = await this.http.post<AuthenticateResponse>(
      authUrl,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    return response
  }
}
