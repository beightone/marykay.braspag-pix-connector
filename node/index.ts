import { PaymentProviderService } from '@vtex/payment-provider'
import { method } from '@vtex/api'

import { clients } from './clients'
import BraspagConnector from './connector'
import {
  notifications,
  parseBody,
  pixSplits,
  withAppSettings,
} from './middlewares'
import { health } from './tools/health'

const service = new PaymentProviderService({
  clients,
  connector: BraspagConnector,
  routes: {
    notifications: method({
      POST: [withAppSettings, parseBody, notifications],
    }),
    health: method({
      GET: [health],
    }),
    pixSplits: method({
      GET: [pixSplits],
    }),
  },
})

export default service
