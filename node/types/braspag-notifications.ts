export interface BraspagNotification {
  PaymentId: string
  ChangeType: number
  Status?: number
  MerchantOrderId?: string
  Amount?: number
  ReceivedDate?: string
  ReasonCode?: number
  ReasonMessage?: string
  ProviderReturnCode?: string
  ProviderReturnMessage?: string
}

export enum BraspagChangeType {
  PaymentStatusChange = 1,
  FraudAnalysisChange = 2,
  Chargeback = 3,
}

export enum BraspagPaymentStatus {
  NotFinished = 0,
  Authorized = 1,
  PaymentConfirmed = 2,
  Denied = 3,
  Voided = 10,
  Refunded = 11,
  Pending = 12,
  Aborted = 13,
  Scheduled = 20,
}

export interface StoredBraspagPayment {
  pixPaymentId: string
  braspagTransactionId?: string
  merchantOrderId: string
  orderId?: string
  status?: number
  type: string
  createdAt?: string
  lastUpdated?: string
  amount?: number
  cancelledAt?: string
  vtexPaymentId?: string
  callbackUrl?: string
  splitPayments?: Array<{
    subordinateMerchantId: string
    amount: number
    mdr?: number
    fee?: number
  }>
  consultantSplitAmount?: number
  masterSplitAmount?: number
}
