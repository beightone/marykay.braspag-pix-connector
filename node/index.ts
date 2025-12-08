import { PaymentProviderService } from '@vtex/payment-provider'
import { method } from '@vtex/api'

import { clients } from './clients'
import BraspagConnector from './connector'
import {
  notifications,
  orderCancellationConfig,
  parseBody,
} from './middlewares'
import { health } from './tools/health'

const service = new PaymentProviderService({
  clients,
  connector: BraspagConnector,
  routes: {
    notifications: method({
      POST: [parseBody, notifications],
    }),
    health: method({
      GET: [health],
    }),
    orderCancellationConfig: method({
      GET: [orderCancellationConfig],
    }),
  },
})

export default service
