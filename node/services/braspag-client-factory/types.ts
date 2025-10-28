import { IOContext } from '@vtex/api'

import { BraspagClient } from '../../clients/braspag'

export interface BraspagClientFactory {
  createClient(vtexContext: IOContext): BraspagClient
}
