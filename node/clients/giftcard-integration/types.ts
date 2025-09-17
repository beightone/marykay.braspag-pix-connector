export type RefundGiftcardRequest = {
  userId: string
  refundValue: number
  orderId: string
}

export type RefundGiftcardResponse = {
  giftCardId: string
  redemptionCode: string
}
