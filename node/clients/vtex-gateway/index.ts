import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export interface ApprovePaymentData {
  paymentId: string
  authorizationId: string
  status: 'approved' | 'denied'
  code: string
  message: string
  tid: string
}

export class VtexGatewayClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('', ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
        'X-VTEX-Use-HTTPS': 'true',
      },
    })
  }

  public async pingRetryCallback(callbackUrl: string): Promise<unknown> {
    console.log('VTEX Gateway: Pinging retry callback', { callbackUrl })

    return this.http.post(callbackUrl, {})
  }
}
