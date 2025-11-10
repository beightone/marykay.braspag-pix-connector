/**
 * Payment Configuration Service
 * Handles merchant settings retrieval and validation
 */

import {
  MerchantSettings,
  PaymentAuthorizationData,
  PaymentConfigurationProvider,
  VtexContext,
} from './types'

/**
 * Service for managing payment provider configuration
 * Abstracts merchant settings retrieval and validation
 */
export class PaymentConfigurationService
  implements PaymentConfigurationProvider {
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
   * Get merchant settings from environment variables
   * Used for cancel() and settle() operations where authorization data is not available
   */
  public getMerchantSettingsFromEnv(): MerchantSettings {
    const environmentSettings: Partial<MerchantSettings> = {
      merchantId: process.env.BRASPAG_MERCHANT_ID,
      clientSecret: process.env.BRASPAG_CLIENT_SECRET,
      merchantKey: process.env.BRASPAG_MERCHANT_KEY,
    }

    return this.validateMerchantSettings(environmentSettings)
  }

  /**
   * Build notification URL for webhook callbacks
   */
  public buildNotificationUrl(vtexContext: VtexContext): string {
    const { workspace, account } = vtexContext

    return `https://${workspace}--${account}.myvtex.com/_v/notifications/braspag`
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
    const missingFields: string[] = []

    if (!extractedSettings.merchantId) {
      missingFields.push('merchantId')
    }

    if (!extractedSettings.clientSecret) {
      missingFields.push('clientSecret')
    }

    if (!extractedSettings.merchantKey) {
      missingFields.push('merchantKey')
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing merchant credentials: ${missingFields.join(', ')}`
      )
    }

    return {
      merchantId: extractedSettings.merchantId as string,
      clientSecret: extractedSettings.clientSecret as string,
      merchantKey: extractedSettings.merchantKey as string,
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
