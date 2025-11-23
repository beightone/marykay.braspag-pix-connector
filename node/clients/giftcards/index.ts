import type { InstanceOptions, IOContext } from '@vtex/api'
import { ExternalClient } from '@vtex/api'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { Logger } from '../../tools/datadog/datadog'
import { Datadog } from '../datadog'

interface RefundVoucherRequest {
  userId: string
  refundValue: number
  orderId: string
}

interface RefundVoucherResponse {
  giftCardId: string
  redemptionCode: string
}

export class GiftcardsClient extends ExternalClient {
  private logger: DatadogLoggerAdapter

  constructor(ctx: IOContext, opts?: InstanceOptions) {
    super(`http://${ctx.workspace}--${ctx.account}.myvtex.com`, ctx, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        VtexIdclientAutCookie: ctx.adminUserAuthToken ?? ctx.authToken,
        'X-Vtex-Use-HTTPS': 'true',
      },
    })

    const datadogClient = new Datadog(ctx, opts)
    const datadogLogger = new Logger(ctx as any, datadogClient)
    this.logger = new DatadogLoggerAdapter(datadogLogger)
  }

  public async createRefundVoucher(
    request: RefundVoucherRequest
  ): Promise<RefundVoucherResponse> {
    const startTime = Date.now()

    this.logger.info('[GIFTCARDS_CLIENT] Creating refund voucher', {
      flow: 'voucher_refund',
      action: 'create_refund_voucher',
      userId: request.userId,
      refundValue: request.refundValue,
      orderId: request.orderId,
      endpoint: '/_v/refund',
      timestamp: new Date().toISOString(),
    })

    try {
      const response = await this.http.post<RefundVoucherResponse>(
        '/_v/refund',
        request,
        {
          metric: 'giftcards-refund-voucher',
          timeout: 15000,
        }
      )

      const duration = Date.now() - startTime

      this.logger.info('[GIFTCARDS_CLIENT] Refund voucher created successfully', {
        flow: 'voucher_refund',
        action: 'refund_voucher_created',
        giftCardId: response.giftCardId,
        redemptionCode: response.redemptionCode,
        userId: request.userId,
        refundValue: request.refundValue,
        orderId: request.orderId,
        duration,
      })

      return response
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      this.logger.error('[GIFTCARDS_CLIENT] Failed to create refund voucher', error, {
        flow: 'voucher_refund',
        action: 'create_refund_voucher_failed',
        error: errorMsg,
        stack: errorStack,
        userId: request.userId,
        refundValue: request.refundValue,
        orderId: request.orderId,
        duration,
      })

      throw error
    }
  }
}

