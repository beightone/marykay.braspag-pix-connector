import { IOContext } from '@vtex/api'

import { BraspagClient } from '../../clients/braspag'
import { MerchantSettings } from '../payment-configuration/types'

export interface BraspagClientFactory {
  createClient(
    vtexContext: IOContext,
    merchantSettings?: MerchantSettings
  ): BraspagClient
}
