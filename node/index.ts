import { PaymentProviderService } from '@vtex/payment-provider'
import { method } from '@vtex/api'

import { clients } from './clients'
import BraspagConnector from './connector'
import { notifications, parseBody } from './middlewares'

const service = new PaymentProviderService({
  clients,
  connector: BraspagConnector,
  routes: {
    notifications: method({
      POST: [parseBody, notifications],
    }),
  },
})

export default service
