/**
 * Payment Configuration Service
 * Handles merchant settings retrieval and validation
 * Follows Single Responsibility Principle (SRP)
 */

export interface MerchantSettings {
  merchantId: string
  clientSecret: string
  merchantKey: string
  monitfyConsultantId?: string
  notificationUrl?: string
}

export interface PaymentConfigurationProvider {
  getMerchantSettings(authorization: PaymentAuthorizationData): MerchantSettings
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

/**
 * Default merchant settings for fallback scenarios
 */
const DEFAULT_MERCHANT_SETTINGS: Omit<MerchantSettings, 'notificationUrl'> = {
  merchantId: 'E28449FA-1268-42BF-B4D3-313BF447285E',
  clientSecret: 'q2R/Ya3zlXFWQ9Ar8FylNbbIyhFJAKvw+eEknMsKTD8=',
  merchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',
}

/**
 * Service for managing payment provider configuration
 * Abstracts merchant settings retrieval and validation
 */
export class PaymentConfigurationService implements PaymentConfigurationProvider {
  /**
   * Extract and validate merchant settings from authorization data
   */
  public getMerchantSettings(
    authorization: PaymentAuthorizationData
  ): MerchantSettings {
    const merchantSettings = authorization.merchantSettings ?? []

    const extractedSettings = this.extractMerchantSettings(merchantSettings)
    const validatedSettings = this.validateMerchantSettings(extractedSettings)

    return validatedSettings
  }

  /**
   * Build notification URL for webhook callbacks
   */
  public buildNotificationUrl(vtexContext: VtexContext): string {
    const { workspace, account } = vtexContext

    return `https://${workspace}--${account}.myvtex.com/_v/api/braspag-pix-connector/notifications`
  }

  /**
   * Extract merchant settings from authorization merchant settings array
   */
  private extractMerchantSettings(
    merchantSettings: Array<{ name: string; value: string }>
  ): Partial<MerchantSettings> {
    const getMerchantSetting = (name: string): string | undefined =>
      merchantSettings.find(ms => ms.name === name)?.value

    return {
      merchantId: getMerchantSetting('merchantId'),
      clientSecret: getMerchantSetting('clientSecret'),
      merchantKey: getMerchantSetting('merchantKey'),
      monitfyConsultantId: getMerchantSetting('monitfyConsultantId'),
    }
  }

  /**
   * Validate and apply fallback values for merchant settings
   */
  private validateMerchantSettings(
    extractedSettings: Partial<MerchantSettings>
  ): MerchantSettings {
    return {
      merchantId:
        extractedSettings.merchantId ?? DEFAULT_MERCHANT_SETTINGS.merchantId,
      clientSecret:
        extractedSettings.clientSecret ??
        DEFAULT_MERCHANT_SETTINGS.clientSecret,
      merchantKey:
        extractedSettings.merchantKey ?? DEFAULT_MERCHANT_SETTINGS.merchantKey,
      monitfyConsultantId: extractedSettings.monitfyConsultantId,
    }
  }
}

/**
 * Factory for creating payment configuration service instances
 */
export class PaymentConfigurationServiceFactory {
  public static create(): PaymentConfigurationService {
    return new PaymentConfigurationService()
  }
}
