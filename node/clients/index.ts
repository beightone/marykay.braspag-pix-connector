import { ClientsConfig, IOClients } from '@vtex/api'

import { BraspagClient } from './braspag'
// import { GiftcardsIntegrationClient } from './giftcard-integration'
// import { StoreServicesClient } from './store-services'
import { Datadog } from './datadog'
import { StoreServicesClient } from './store-services'

export class Clients extends IOClients {
  public get braspag() {
    return this.getOrSet('braspag', BraspagClient)
  }

  public get datadog() {
    return this.getOrSet('datadog', Datadog)
  }

  public get storeServices() {
    return this.getOrSet('storeServices', StoreServicesClient)
  }
}

const THIRTY_SECONDS = 30000

export const clients: ClientsConfig<Clients> = {
  implementation: Clients,
  options: {
    default: {
      retries: 2,
      timeout: THIRTY_SECONDS,
    },
    braspag: {
      retries: 3,
      timeout: THIRTY_SECONDS,
    },
  },
}
