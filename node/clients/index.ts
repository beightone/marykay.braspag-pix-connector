import { ClientsConfig, IOClients } from '@vtex/api'

import { BraspagClient } from './braspag'
import { Datadog } from './datadog'
import { StoreServicesClient } from './store-services'
import { OMSClient } from './orders'
import { HublyClient } from './hubly'

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

  public get orders() {
    return this.getOrSet('orders', OMSClient)
  }

  public get hubly() {
    return this.getOrSet('hubly', HublyClient)
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
    orders: {
      retries: 3,
      timeout: THIRTY_SECONDS,
    },
    hubly: {
      retries: 3,
      timeout: THIRTY_SECONDS,
    },
  },
}
