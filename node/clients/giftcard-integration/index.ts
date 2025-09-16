import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import { RefundGiftcardRequest, RefundGiftcardResponse } from './types'

export class GiftcardsIntegrationClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('', context, {
      ...options,
      headers: {
        ...options?.headers,
      },
    })
  }

  public async refund(payload: RefundGiftcardRequest) {
    const { logger } = this.context as any

    try {
      logger?.info('GIFTCARDS_REFUND_REQUEST', {
        userId: payload.userId,
        refundValue: payload.refundValue,
        orderId: payload.orderId,
      })

      const response = await this.http.post<RefundGiftcardResponse>(
        `http://${this.context.workspace}--${this.context.account}.myvtex.com/_v/refund`,
        payload
      )

      logger?.info('GIFTCARDS_REFUND_SUCCESS', {
        userId: payload.userId,
        refundValue: payload.refundValue,
        orderId: payload.orderId,
        giftCardId: response.giftCardId,
        redemptionCode: response.redemptionCode,
      })

      return response
    } catch (error) {
      logger?.error('GIFTCARDS_REFUND_FAILED', {
        userId: payload.userId,
        refundValue: payload.refundValue,
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }
}
