export async function pixSplits(ctx: Context) {
  const paymentId =
    (ctx as any)?.vtex?.route?.params?.paymentId || (ctx as any).query?.paymentId

  const { Logger } = require('../../tools/datadog/datadog')
  const { DatadogLoggerAdapter } = require('../../tools/datadog/logger-adapter')

  const logger = new Logger(ctx, (ctx as any).clients.datadog)
  const adapter = new DatadogLoggerAdapter(logger)

  try {
    if (!paymentId) {
      ctx.status = 400
      ctx.body = { error: 'paymentId is required' }

      return
    }

    const stored = await (ctx as any).clients.vbase.getJSON(
      'payments',
      paymentId,
      true
    )

    if (!stored) {
      ctx.status = 404
      ctx.body = { error: 'Payment not found' }

      return
    }

    ctx.status = 200
    ctx.body = {
      paymentId,
      vtexPaymentId: stored.vtexPaymentId,
      status: stored.status,
      splitPayments: stored.splitPayments || [],
      consultantSplitAmount: stored.consultantSplitAmount,
      masterSplitAmount: stored.masterSplitAmount,
    }
  } catch (error) {
    adapter.error('PIX_SPLITS_FEED_ERROR', error as Error)
    ctx.status = 500
    ctx.body = { error: 'Internal error' }
  }
}


