import type { IOContext, InstanceOptions } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

export class Datadog extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('http://http-intake.logs.datadoghq.com/api/v2', ctx, {
      ...options,
      headers: {
        ...options?.headers,
        'DD-API-KEY': '8d9e2bc2c29081347f62a8c63f671ea0',
        'X-Vtex-Use-Https': 'true',
      },
    })
  }

  public save(data: any) {
    return this.http.post('/logs', data)
  }
}
