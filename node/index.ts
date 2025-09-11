import { PaymentProviderService } from '@vtex/payment-provider'
import { method } from '@vtex/api'

import { clients } from './clients'
import { notifications } from './middlewares/notifications'
import BraspagConnector from './connector'

const service = new PaymentProviderService({
  clients,
  connector: BraspagConnector,
  routes: {
    notifications: method({
      POST: [notifications],
    }),
  },
})

export default service
