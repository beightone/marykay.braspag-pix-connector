export interface VtexOrder {
  orderId: string
  sequence: string
  marketplaceOrderId: string
  marketplaceServicesEndpoint: string
  sellerOrderId: string
  origin: string
  affiliateId: string
  salesChannel: string
  merchantName: string | null
  status: string
  workflowIsInError: boolean
  statusDescription: string | null
  value: number
  creationDate: string
  lastChange: string
  orderGroup: string
  followUpEmail: string
  lastMessage: string | null
  hostname: string
  isCompleted: boolean
  roundingError: number
  orderFormId: string
  allowCancellation: boolean
  allowEdition: boolean
  isCheckedIn: boolean
  authorizedDate: string | null
  invoicedDate: string | null
  cancelReason: string | null
  checkedInPickupPointId: string | null
  customData?: VtexOrderCustomData
}

export interface VtexOrderCustomData {
  customApps?: VtexCustomApp[]
  customFields?: unknown[]
}

export interface VtexCustomApp {
  fields: Record<string, string>
  id: string
  major: number
}

export interface ConsultantData {
  consultantId: string
  userIdAlpha: string
  monitfyConsultantId: string
}

export interface SplitSimulationData {
  splitProfitPct: string
  splitDiscountPct: string
}

export interface ExtractedOrderData {
  consultantId?: string
  splitProfitPct?: number
  splitDiscountPct?: number
  braspagId?: string
  itemsSubtotal?: number
  discountsSubtotal?: number
  shippingValue?: number
  couponDiscount?: number
  totalTaxes?: number
}
