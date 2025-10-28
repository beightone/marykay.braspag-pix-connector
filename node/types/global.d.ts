import {
  ServiceContext,
  RecorderState,
  ParamsContext,
  EventContext,
} from '@vtex/api'
import { PaymentProviderState } from '@vtex/payment-provider'

import { Clients } from '../clients'
import { DatadogCompatibleLogger } from '../tools/datadog/logger.types'

declare global {
  type Context = ServiceContext<Clients, State, CustomContextFields>

  type PaymentProviderContext = ServiceContext<
    Clients,
    PaymentProviderState
  > & {
    logger: DatadogCompatibleLogger
  }

  type CustomContextFields = ParamsContext & {
    logger: DatadogCompatibleLogger
  }

  type State = RecorderState & {
    body: unknown
  }

  interface InstalledAppEvent extends EventContext<Clients> {
    body: { id?: string }
  }
  export type NextMiddleware = () => Promise<void>
}
