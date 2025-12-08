export type SimulateSplitRequest = {
  monitfyConsultantId: string
  orderFormId?: string
}

export type SimulateSplitResponse = {
  splitProfitPct: number
  splitDiscountPct: number
}

export type EncryptOrderInfosRequest = {
  consultantCode: string
  consultantName: string
  consultantCareerLevel: string
  orderId: string
}

export type EncryptOrderInfosResponse = {
  encryptedData: string
}
