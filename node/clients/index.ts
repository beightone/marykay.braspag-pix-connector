import { ClientsConfig, IOClients } from '@vtex/api'

import { BraspagClient } from './braspag'
// import { GiftcardsIntegrationClient } from './giftcard-integration'
// import { StoreServicesClient } from './store-services'
import { Datadog } from './datadog'

export class Clients extends IOClients {
  public get braspag() {
    return this.getOrSet('braspag', BraspagClient)
  }

  public get datadog() {
    return this.getOrSet('datadog', Datadog)
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
