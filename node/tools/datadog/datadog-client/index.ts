import type { IOContext, InstanceOptions } from '@vtex/api'
import { ExternalClient } from '@vtex/api'

export class Datadog extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('http://beightone.myvtex.com/_v0.0/api', ctx, {
      ...options,
      headers: {
        ...options?.headers,
        'X-Vtex-Use-Https': 'true',
      },
    })
  }

  public save(data: any) {
    return this.http.post('/send-log', data)
  }
}
