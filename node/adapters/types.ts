/**
 * Configuration options for Braspag PIX adapter
 */
export interface BraspagPixAdapterConfig {
  merchantId: string
  monitfyConsultantId?: string
  braspagId?: string
  notificationUrl?: string
  splitProfitPct?: number
  splitDiscountPct?: number
  itemsSubtotal?: number
  discountsSubtotal?: number
  shippingValue?: number
  couponDiscount?: number
  isConsultantCoupon?: boolean
  isFreeShippingCoupon?: boolean
}

/**
 * Split transaction configuration
 */
export interface SplitTransaction {
  merchantId: string
  amount: number
  commission?: {
    fee?: number
    gateway?: number
  }
}

/**
 * Buyer information interface
 */
export interface BuyerInfo {
  firstName: string
  lastName: string
  document: string
  corporateName?: string
  corporateDocument?: string
  isCorporate: boolean
}

/**
 * Mary Kay custom data structure from VTEX order
 */
export interface MaryKayCustomData {
  customApps?: Array<{
    fields: Record<string, string | undefined>
    id: string
    major: number
  }>
  customFields?: unknown[]
}

/**
 * Extended authorization request with split support and Mary Kay custom data
 */
export interface AuthorizationWithSplits {
  transactionId: string
  value: number
  splits?: SplitTransaction[]
  customData?: MaryKayCustomData
  miniCart: {
    buyer: BuyerInfo
  }
}
