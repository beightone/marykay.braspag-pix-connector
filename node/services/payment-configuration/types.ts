export interface MerchantSettings {
  merchantId: string
  clientSecret: string
  merchantKey: string
  monitfyConsultantId?: string
  notificationUrl?: string
  mdr?: number
  fee?: number
}

export interface PaymentConfigurationProvider {
  getMerchantSettings(authorization: PaymentAuthorizationData): MerchantSettings
  getMerchantSettingsFromEnv(): MerchantSettings
  buildNotificationUrl(vtexContext: VtexContext): string
}

export interface PaymentAuthorizationData {
  merchantSettings?: Array<{ name: string; value: string }>
  paymentId: string
  paymentMethod?: string
  miniCart?: { paymentMethod?: string }
}

export interface VtexContext {
  workspace: string
  account: string
}
