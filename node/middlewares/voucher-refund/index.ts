import { json } from 'co-body'

import { VoucherRefundServiceFactory } from '../../services'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { Logger } from '../../tools/datadog/datadog'
import { PaymentStorageServiceFactory } from '../../services/payment-storage'
import type { VoucherRefundRequest } from '../../services/voucher-refund/types'

export async function voucherRefundHandler(ctx: Context) {
  const logger = new DatadogLoggerAdapter(
    new Logger(ctx as Context, ctx.clients.datadog)
  )

  const startTime = Date.now()

  logger.info('VOUCHER_REFUND_HANDLER: ===== START REQUEST =====', {
    method: ctx.method,
    path: ctx.request.path,
    account: ctx.vtex.account,
    workspace: ctx.vtex.workspace,
    timestamp: new Date().toISOString(),
  })

  try {
    logger.info('VOUCHER_REFUND_HANDLER: Parsing request body', {})

    const body = await json(ctx.req)

    logger.info('VOUCHER_REFUND_HANDLER: Request body parsed', {
      hasBody: !!body,
      bodyKeys: body ? Object.keys(body) : [],
      orderId: (body as VoucherRefundRequest)?.orderId,
      paymentId: (body as VoucherRefundRequest)?.paymentId,
      userId: (body as VoucherRefundRequest)?.userId,
      refundValue: (body as VoucherRefundRequest)?.refundValue,
    })

    const { orderId, paymentId, userId, refundValue } = body as VoucherRefundRequest

    if (!orderId || !paymentId || !userId || !refundValue) {
      logger.warn('VOUCHER_REFUND_HANDLER: Missing required fields', {
        hasOrderId: !!orderId,
        hasPaymentId: !!paymentId,
        hasUserId: !!userId,
        hasRefundValue: !!refundValue,
        receivedFields: { orderId, paymentId, userId, refundValue },
      })

      ctx.status = 400
      ctx.body = {
        success: false,
        message: 'Missing required fields: orderId, paymentId, userId, refundValue',
      }

      logger.info('VOUCHER_REFUND_HANDLER: ===== END REQUEST (VALIDATION ERROR) =====', {
        status: 400,
        duration: Date.now() - startTime,
      })

      return
    }

    logger.info('VOUCHER_REFUND_HANDLER: Initializing services', {
      orderId,
      paymentId,
      userId,
      refundValue,
    })

    const storageService = PaymentStorageServiceFactory.createPaymentStorage(
      ctx.clients.vbase
    )

    logger.info('VOUCHER_REFUND_HANDLER: Storage service created', {})

    const voucherRefundService = VoucherRefundServiceFactory.create({
      giftcardsClient: ctx.clients.giftcards,
      ordersClient: {
        cancelOrderInVtex: ctx.clients.orders.cancelOrderInVtex.bind(ctx.clients.orders),
      },
      storageService,
      logger,
    })

    logger.info('VOUCHER_REFUND_HANDLER: Voucher refund service created', {})

    logger.info('VOUCHER_REFUND_HANDLER: Starting voucher refund process', {
      orderId,
      paymentId,
      userId,
      refundValue,
    })

    const result = await voucherRefundService.processVoucherRefund({
      orderId,
      paymentId,
      userId,
      refundValue,
    })

    logger.info('VOUCHER_REFUND_HANDLER: Process completed successfully', {
      result,
      duration: Date.now() - startTime,
    })

    ctx.status = 200
    ctx.body = result

    logger.info('VOUCHER_REFUND_HANDLER: ===== END REQUEST (SUCCESS) =====', {
      status: 200,
      duration: Date.now() - startTime,
      giftCardId: result.giftCardId,
      redemptionCode: result.redemptionCode,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    logger.error('VOUCHER_REFUND_HANDLER: Error processing request', {
      error: errorMessage,
      stack: errorStack,
      duration: Date.now() - startTime,
    })

    ctx.status = 500
    ctx.body = {
      success: false,
      message: errorMessage,
    }

    logger.info('VOUCHER_REFUND_HANDLER: ===== END REQUEST (ERROR) =====', {
      status: 500,
      duration: Date.now() - startTime,
      error: errorMessage,
    })
  }
}

