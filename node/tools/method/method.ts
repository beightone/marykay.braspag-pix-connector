import type {
  IOClients,
  ParamsContext,
  RecorderState,
  RouteHandler,
} from '@vtex/api'
import { method as vtexMethod } from '@vtex/api'

import type { Clients } from '../../clients'
import { injectLogger } from '../datadog/log/inject-logger'
import type { MethodOptions } from '../../typings/custom'
import { errorMiddleware } from './error-middleware'

const arrayLog = [injectLogger, errorMiddleware]

export function method<
  T extends IOClients,
  U extends RecorderState,
  V extends ParamsContext
>(
  options: MethodOptions<T, U, V>
):
  | RouteHandler<Clients, RecorderState, CustomContextFields>
  | Array<RouteHandler<Clients, RecorderState, CustomContextFields>> {
  const newObj: any = {}

  Object.keys(options).forEach((m) => {
    // @ts-ignore
    newObj[m] = [...arrayLog, ...options[m]]
  })

  return vtexMethod(newObj)
}
