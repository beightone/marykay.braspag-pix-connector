/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-ignore */
import {
  IOClients,
  ParamsContext,
  RecorderState,
  RouteHandler,
  method as vtexMethod,
} from '@vtex/api'

import { Clients } from '../../clients'
// import { injectLogger } from '../datadog/log/inject-logger'
// import { errorMiddleware } from './error-middleware'
import { MethodOptions } from '../../types/custom'

// const arrayLog = [injectLogger, errorMiddleware]

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

  Object.keys(options).forEach(m => {
    // @ts-ignore
    newObj[m] = [...arrayLog, ...options[m]]
  })

  return vtexMethod(newObj)
}
