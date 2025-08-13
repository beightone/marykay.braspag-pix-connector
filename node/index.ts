import { PaymentProviderService } from '@vtex/payment-provider'

import { clients } from './clients'
import TestSuiteApprover from './connector'

export default new PaymentProviderService({
  clients,
  connector: TestSuiteApprover,
})
