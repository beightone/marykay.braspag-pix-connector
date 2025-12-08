import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { Logger } from '../../tools/datadog/datadog'
import { Datadog } from '../datadog'

export interface ApprovePaymentData {
  paymentId: string
  authorizationId: string
  status: 'approved' | 'denied'
  code: string
  message: string
  tid: string
}

export class VtexGatewayClient extends ExternalClient {
  private logger: DatadogLoggerAdapter

  constructor(ctx: IOContext, options?: InstanceOptions) {
    super('', ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
        'X-VTEX-Use-HTTPS': 'true',
      },
    })

    const datadogClient = new Datadog(ctx, options)
    const datadogLogger = new Logger(ctx as any, datadogClient)
    this.logger = new DatadogLoggerAdapter(datadogLogger)
  }

  public async pingRetryCallback(callbackUrl: string): Promise<unknown> {
    this.logger.info('[VTEX_GATEWAY] Pinging retry callback', {
      flow: 'authorization',
      action: 'ping_retry_callback',
      callbackUrl,
    })

    return this.http.post(callbackUrl, {})
  }
}
