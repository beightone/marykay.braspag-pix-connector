export interface VoucherRefundRequest {
  orderId: string
  paymentId: string
  userId: string
  refundValue: number
}

export interface VoucherRefundResponse {
  success: boolean
  giftCardId: string
  redemptionCode: string
  refundValue: number
  orderId: string
  message: string
}

export interface VoucherRefundServiceDeps {
  giftcardsClient: {
    createRefundVoucher: (request: {
      userId: string
      refundValue: number
      orderId: string
    }) => Promise<{ giftCardId: string; redemptionCode: string }>
  }
  ordersClient: {
    cancelOrderInVtex: (orderId: string, reason?: string) => Promise<void>
  }
  storageService: {
    getStoredPayment: (paymentId: string) => Promise<import('../../types/braspag-notifications').StoredBraspagPayment | null>
    updatePaymentStatus: (paymentId: string, status: number) => Promise<void>
  }
  logger: {
    info: (message: string, data?: Record<string, unknown>) => void
    error: (message: string, data?: Record<string, unknown>) => void
    warn: (message: string, data?: Record<string, unknown>) => void
  }
}

export interface StoredPaymentData {
  paymentId: string
  orderId: string
  amount: number
  status: number
  braspagPaymentId?: string
  qrCodeBase64Image?: string
  qrCodeString?: string
  callbackUrl?: string
  createdAt?: string
  updatedAt?: string
}

export interface VoucherRefundService {
  processVoucherRefund: (
    request: VoucherRefundRequest
  ) => Promise<VoucherRefundResponse>
}

