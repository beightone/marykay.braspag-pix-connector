import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

interface RefundVoucherRequest {
  userId: string
  refundValue: number
  orderId: string
}

interface RefundVoucherResponse {
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
    const startTime = Date.now()

    console.log('GIFTCARDS_CLIENT: Creating refund voucher', {
      userId: request.userId,
      refundValue: request.refundValue,
      orderId: request.orderId,
      endpoint: '/_v/refund',
      timestamp: new Date().toISOString(),
    })

    try {
      const response = await this.http.post<RefundVoucherResponse>(
        '/_v/refund',
        request,
        {
          metric: 'giftcards-refund-voucher',
          timeout: 15000,
        }
      )

      const duration = Date.now() - startTime

      console.log('GIFTCARDS_CLIENT: Refund voucher created successfully', {
        giftCardId: response.giftCardId,
        redemptionCode: response.redemptionCode,
        userId: request.userId,
        refundValue: request.refundValue,
        orderId: request.orderId,
        duration,
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      console.error('GIFTCARDS_CLIENT: Failed to create refund voucher', {
        error: errorMsg,
        stack: errorStack,
        userId: request.userId,
        refundValue: request.refundValue,
        orderId: request.orderId,
        duration,
      })

      throw error
    }
  }
}

