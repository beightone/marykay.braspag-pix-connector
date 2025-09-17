import { IOContext } from '@vtex/api'

import { BraspagClient } from '../../clients/braspag'
import { TIMEOUT_CONFIG } from '../../constants/payment-constants'
import { BraspagClientFactory } from './types'
import { MerchantSettings } from '../payment-configuration/types'

/**
 * Factory for creating properly configured BraspagClient instances
 */
export class DefaultBraspagClientFactory implements BraspagClientFactory {
  /**
   * Creates a BraspagClient with standardized configuration
   */
  public createClient(
    vtexContext: IOContext,
    merchantSettings: MerchantSettings
  ): BraspagClient {
    const ioContext = {
      ...vtexContext,
      settings: {
        merchantId: merchantSettings.merchantId,
        clientSecret: merchantSettings.clientSecret,
        merchantKey: merchantSettings.merchantKey,
      },
    }

    return new BraspagClient(ioContext, {
      timeout: TIMEOUT_CONFIG.BRASPAG_REQUEST_TIMEOUT,
      retries: TIMEOUT_CONFIG.BRASPAG_RETRIES,
    })
  }
}

/**
 * Singleton factory instance
 */
export const braspagClientFactory = new DefaultBraspagClientFactory()
