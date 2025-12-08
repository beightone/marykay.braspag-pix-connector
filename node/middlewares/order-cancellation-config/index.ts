import { Order } from '../../types/oms.client'

const MARY_KAY_AUTOSERVICE_URL =
  'https://www.marykayintouch.com.br/AutoService/Atendimento/Inicial?pedido='

const getOrderIdFromContext = (ctx: Context) => {
  const routeOrderId = (ctx as any)?.vtex?.route?.params?.orderId as
    | string
    | undefined
  const queryOrderId = (ctx.query as any)?.orderId as string | undefined

  if (routeOrderId) {
    return routeOrderId
  }

  if (queryOrderId) {
    return queryOrderId
  }

  return undefined
}

const getConsultantDataFromOrder = (order: Order) => {
  const customData = (order.customData as any) ?? {}
  const customApps = (customData.customApps as any[]) ?? []
  const consultantApp = customApps.find(
    app => app && app.id === 'consultant'
  ) as
    | {
        fields?: {
          consultantId?: string
          consultantName?: string
          consultantCareerLevel?: string
        }
      }
    | undefined

  const rawConsultantId = consultantApp?.fields?.consultantId
  const consultantCode = rawConsultantId
    ? rawConsultantId.split('_')[0]
    : ''

  const consultantName = consultantApp?.fields?.consultantName ?? ''
  const consultantCareerLevel =
    consultantApp?.fields?.consultantCareerLevel ?? ''

  return {
    consultantCode,
    consultantName,
    consultantCareerLevel,
  }
}

const buildEncryptedExternalUrl = async (ctx: Context, order: Order) => {
  const { consultantCode, consultantName, consultantCareerLevel } =
    getConsultantDataFromOrder(order)

  const storeServicesClient = (ctx as any).clients.storeServices

  const response = await storeServicesClient.encryptOrderInfos({
    consultantCode,
    consultantName,
    consultantCareerLevel,
    orderId: order.orderId,
  })

  const encryptedData = response.encryptedData

  const baseUrl =
    (process.env.MARYKAY_AUTOSERVICE_URL as string | undefined) ||
    MARY_KAY_AUTOSERVICE_URL

  return `${baseUrl}${encryptedData}`
}

export const orderCancellationConfig = async (ctx: Context) => {
  const { Logger } = require('../../tools/datadog/datadog')
  const { DatadogLoggerAdapter } = require('../../tools/datadog/logger-adapter')

  const logger = new Logger(ctx, (ctx as any).clients.datadog)
  const adapter = new DatadogLoggerAdapter(logger)

  try {
    const orderId = getOrderIdFromContext(ctx)

    if (!orderId) {
      ctx.status = 400
      ctx.body = { error: 'orderId is required' }

      return
    }

    const order = (await (ctx as any).clients.orders.getOrder(
      orderId
    )) as Order

    const transactions = order.paymentData?.transactions ?? []
    const payments = transactions.flatMap(transaction => transaction.payments)

    if (!payments.length) {
      ctx.status = 400
      ctx.body = { error: 'Order has no payments' }

      return
    }

    const groups = payments.map(payment =>
      (payment.group ?? '').toLowerCase()
    )

    const isPixOrder = groups.includes('pix')
    const isCardOrder = !isPixOrder

    const packages = order.packageAttachment?.packages ?? []
    const isInvoiced = packages.some(
      currentPackage => !!currentPackage.invoiceKey
    )

    if (isPixOrder) {
      const externalUrl = await buildEncryptedExternalUrl(ctx, order)

      ctx.status = 200
      ctx.body = {
        showCancelButton: true,
        flow: 'marykay-external',
        orderId,
        paymentType: 'pix',
        invoiced: isInvoiced,
        externalUrl,
      }

      return
    }

    if (isCardOrder && !isInvoiced) {
      ctx.status = 200
      ctx.body = {
        showCancelButton: true,
        flow: 'vtex-native',
        orderId,
        paymentType: 'card',
        invoiced: false,
      }

      return
    }

    const externalUrl = await buildEncryptedExternalUrl(ctx, order)

    ctx.status = 200
    ctx.body = {
      showCancelButton: true,
      flow: 'marykay-external',
      orderId,
      paymentType: 'card',
      invoiced: isInvoiced,
      externalUrl,
    }
  } catch (error) {
    adapter.error('ORDER_CANCELLATION_CONFIG_ERROR', error as Error, {
      orderId: getOrderIdFromContext(ctx),
    })

    ctx.status = 500
    ctx.body = {
      error:
        'Internal error while processing order cancellation configuration',
    }
  }
}

