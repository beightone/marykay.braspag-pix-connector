import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

export interface RefundVoucherRequest {
  userId: string
  refundValue: number
  orderId: string
}

export interface RefundVoucherResponse {
  giftCardId: string
  redemptionCode: string
}

export class GiftcardsClient extends ExternalClient {
  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super(`http://${ctx.account}.vtex.local`, ctx, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        VtexIdclientAutCookie: ctx.adminUserAuthToken ?? ctx.authToken,
        'X-Vtex-Use-HTTPS': 'true',
      },
    })
  }

  public async createRefundVoucher(
    request: RefundVoucherRequest
  ): Promise<RefundVoucherResponse> {
    return this.http.post<RefundVoucherResponse>('/_v/refund', request, {
      metric: 'giftcards-refund-voucher',
      timeout: 15000,
    })
  }
}
