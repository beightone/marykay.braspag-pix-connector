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

  public async approvePayment(
    account: string,
    transactionId: string,
    paymentId: string,
    data: ApprovePaymentData
  ): Promise<unknown> {
    const url = `https://${account}.vtexpayments.com.br/api/pvt/payment-provider/transactions/${transactionId}/payments/${paymentId}/callback?accountName=${account}`

    console.log('VTEX Gateway: Approving payment', {
      url,
      transactionId,
      paymentId,
      data,
    })

    return this.http.post(url, data)
  }

  public async getPayment(
    account: string,
    transactionId: string
  ): Promise<unknown> {
    const url = `http://${account}.vtexpayments.com.br/api/pvt/transactions/${transactionId}/payments`

    return this.http.get(url)
  }

  public async cancelPayment(
    account: string,
    transactionId: string,
    value: number
  ): Promise<unknown> {
    const url = `http://${account}.vtexpayments.com.br/api/pvt/transactions/${transactionId}/cancellation-request`

    return this.http.post(url, { value })
  }

  public async refundPayment(
    account: string,
    transactionId: string,
    value: number
  ): Promise<unknown> {
    const url = `http://${account}.vtexpayments.com.br/api/pvt/transactions/${transactionId}/refunding-request`

    return this.http.post(url, { value })
  }
}