import { PaymentProviderService } from '@vtex/payment-provider'

import TestSuiteApprover from './connector'
import { clients } from './clients'

// Create enhanced service with middlewares
const service = new PaymentProviderService({
  clients,
  connector: TestSuiteApprover,
})

export default service
