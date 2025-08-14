import { ClientsConfig, IOClients } from '@vtex/api'

import { BraspagClient } from './braspag'
import { GiftcardsIntegrationClient } from './giftcard-integration'
import { StoreServicesClient } from './store-services'

export class Clients extends IOClients {
  public get braspag() {
    return this.getOrSet('braspag', BraspagClient)
  }

  public get storeServices() {
    return this.getOrSet('storeServices', StoreServicesClient)
  }

  public get giftcardsIntegration() {
    return this.getOrSet('giftcardsIntegration', GiftcardsIntegrationClient)
  }
}

const EIGHT_SECONDS = 8000

export const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 2,
      timeout: EIGHT_SECONDS,
    },
  },
}
