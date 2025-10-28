import { IOContext } from '@vtex/api'

import { BraspagClient } from '../../clients/braspag'
import { TIMEOUT_CONFIG } from '../../constants/payment-constants'
import { BraspagClientFactory } from './types'

export class DefaultBraspagClientFactory implements BraspagClientFactory {
  public createClient(vtexContext: IOContext): BraspagClient {
    return new BraspagClient(vtexContext, {
      timeout: TIMEOUT_CONFIG.BRASPAG_REQUEST_TIMEOUT,
      retries: TIMEOUT_CONFIG.BRASPAG_RETRIES,
    })
  }
}

/**
 * Singleton factory instance
 */
export const braspagClientFactory = new DefaultBraspagClientFactory()
