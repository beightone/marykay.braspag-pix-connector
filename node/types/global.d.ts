import {
  ServiceContext,
  RecorderState,
  ParamsContext,
  EventContext,
} from '@vtex/api'

import { Clients } from '../clients'
import { Logger } from '../tools/datadog/datadog'

declare global {
  type Context = ServiceContext<Clients, State, CustomContextFields>

  type PaymentProviderContext = ServiceContext<
    Clients,
    PaymentProviderState
  > & {
    logger: Logger
  }

  type CustomContextFields = ParamsContext & {
    logger: Logger
  }

  type State = RecorderState & {
    body: unknown
  }

  interface InstalledAppEvent extends EventContext<Clients> {
    body: { id?: string }
  }
  export type NextMiddleware = () => Promise<void>
}
