import { ClientsConfig, IOClients } from '@vtex/api'

import { BraspagClient } from './braspag'

export class Clients extends IOClients {
  public get braspag() {
    return this.getOrSet('braspag', BraspagClient)
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
