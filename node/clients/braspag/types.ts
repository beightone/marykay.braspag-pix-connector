export type AuthenticateResponse = {
  access_token: string
  token_type: string
  expires_in: number
}

export type CreatePixSaleRequest = {
  MerchantOrderId: string
  Customer?: Customer
  Payment: PaymentEntry
}

export type Customer = {
  Name?: string
  Identity?: string
  IdentityType: 'CPF'
}

export type PaymentEntry = {
  Type: 'Pix'
  Amount: number
  Provider: 'Braspag'
  SplitPayments?: SplitPaymentEntry[]
}

export type SplitPaymentEntry = {
  SubordinateMerchantId: string
  Amount: number
  Fares?: {
    Mdr?: number
    Fee?: number
  }
}

export type PixPaymentData = {
  PaymentId: string
  Status?: number
  Tid?: string
  QrCodeString?: string
  QrCodeBase64Image?: string
  QrcodeBase64Image?: string
  ReceivedDate?: string
  ExpiresAt?: string
}

export type CreatePixSaleResponse = {
  MerchantOrderId?: string
  Customer?: Customer
  Payment: PixPaymentData
}

export type VoidSplitPaymentEntry = {
  SubordinateMerchantId: string
  VoidedAmount: number
}

export type VoidPixRequest = {
  VoidSplitPayments: VoidSplitPaymentEntry[]
}

export type VoidPixResponse = {
  Status?: number
  Message?: string
  ReasonCode?: number
  ReasonMessage?: string
}
