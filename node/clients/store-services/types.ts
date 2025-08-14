export type SimulateSplitRequest = {
  monitfyConsultantId: string
  orderFormId?: string
}

export type SimulateSplitResponse = {
  splitProfitPct: number
  splitDiscountPct: number
}
