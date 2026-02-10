import { OMS } from '@vtex/clients'
import type { InstanceOptions, IOContext } from '@vtex/api'
import type { AuthMethod, OrderDetailResponse } from '@vtex/clients'

import { ExtractedOrderData } from './types'
import { HublyClient } from '../hubly'
import { DatadogLoggerAdapter } from '../../tools/datadog/logger-adapter'
import { Logger } from '../../tools/datadog/datadog'
import { Datadog } from '../datadog'
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types';

export class OMSClient extends OMS {
  private hublyClient: HublyClient
  private logger: DatadogCompatibleLogger

  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
    })

    this.hublyClient = new HublyClient(ctx, options)
    const datadogClient = new Datadog(ctx, options)
    const datadogLogger = new Logger(ctx as any, datadogClient)

    this.logger = new DatadogLoggerAdapter(datadogLogger)
  }

  private readonly defaultAuthMethod: AuthMethod = 'AUTH_TOKEN'

  public async getOrder(id: string): Promise<OrderDetailResponse> {
    return this.order(id, this.defaultAuthMethod)
  }

  public async cancelOrderInVtex(orderId: string, reason?: string): Promise<void> {
    const cancelReason = reason ?? 'Reembolso do pedido'
    const startTime = Date.now()

    try {
      await this.http.post(
        `/api/oms/pvt/orders/${orderId}/cancel`,
        { reason: cancelReason },
        {
          metric: 'oms-cancel-order',
          timeout: 10000,
        }
      )

      this.logger.info('OMS.CANCEL_ORDER.SUCCESS', {
        flow: 'oms',
        action: 'order_cancelled',
        orderId,
        reason: cancelReason,
        durationMs: Date.now() - startTime,
      })
    } catch (error) {
      this.logger.error('OMS.CANCEL_ORDER.FAILED', error, {
        flow: 'oms',
        action: 'cancel_order_failed',
        orderId,
        reason: cancelReason,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startTime,
      })

      throw error
    }
  }

  public async extractOrderData(
    orderId: string,
    hublyConfig?: { apiKey?: string; organizationId?: string },
    logger?: DatadogCompatibleLogger
  ): Promise<ExtractedOrderData> {
    const order = await this.getOrder(orderId)

    const customApps = order.customData?.customApps ?? []

    const consultantApp = customApps.find((app) => app.id === 'consultant')
    const splitApp = customApps.find((app) => app.id === 'splitsimulation')

    const consultantId = consultantApp?.fields?.consultantId?.split('_')[0]

    const splitProfitPct = splitApp?.fields?.splitProfitPct
      ? parseFloat(splitApp.fields.splitProfitPct)
      : undefined

    const splitDiscountPct = splitApp?.fields?.splitDiscountPct
      ? parseFloat(splitApp.fields.splitDiscountPct)
      : undefined

    const totals = order.totals || []
    const itemsSubtotal = totals.find((t) => t.id === 'Items')?.value ?? 1
    const discountsSubtotal = totals.find((t) => t.id === 'Discounts')?.value ?? 0
    const shippingValue = totals.find((t) => t.id === 'Shipping')?.value ?? 0

    let couponDiscount = 0
    const couponCode = (order as any)?.marketingData?.coupon as string | undefined
    const rateIds = (order as any)?.ratesAndBenefitsData?.rateAndBenefitsIdentifiers as
      | Array<{ id: string; matchedParameters: Record<string, string> }>
      | undefined

    const couponPromotionId = rateIds?.find(
      (p) => p.matchedParameters?.['couponCode@Marketing'] === couponCode
    )?.id

    if (couponPromotionId) {
      const items = (order.items as any[]) || []

      couponDiscount = items.reduce((acc: number, item: any) => {
        const priceTags: Array<{ identifier?: string; value: number }> =
          (item.priceTags as any[]) || []

        const tag = priceTags.find((t) => t.identifier === couponPromotionId)

        if (!tag) return acc

        return (acc as number) + Math.abs((tag.value ?? 0) as number)
      }, 0)
    }

    let braspagId: string | undefined

    if (consultantId) {
      try {
        const apiKey = hublyConfig?.apiKey
        const organizationId = hublyConfig?.organizationId

        const consultantData = await this.hublyClient.getConsultantData(
          consultantId,
          apiKey,
          organizationId
        )

        braspagId = this.hublyClient.getBraspagIdFromConsultant(consultantData)

        this.logger.info('HUBLY.CONSULTANT_RESOLVED', {
          flow: 'authorization',
          action: 'consultant_resolved',
          consultantId,
          braspagId,
          hasAdditionalInfo: !!(consultantData.additionalInfo?.length),
        })
      } catch (error) {
        this.logger.warn('HUBLY.CONSULTANT_FETCH_FAILED', {
          flow: 'authorization',
          action: 'consultant_fetch_failed',
          consultantId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const isFreeShippingCoupon = shippingValue === 0 && couponDiscount > 0

    if (isFreeShippingCoupon) {
      logger?.info('ORDER.FREE_SHIPPING_COUPON', {
        flow: 'authorization',
        action: 'free_shipping_coupon_detected',
        orderId,
        couponDiscount,
        shippingValue,
      })
    }

    const extractedData = {
      consultantId,
      splitProfitPct,
      splitDiscountPct,
      braspagId,
      itemsSubtotal,
      discountsSubtotal,
      shippingValue,
      couponDiscount: isFreeShippingCoupon ? 0 : couponDiscount,
      isFreeShippingCoupon,
    }

    return extractedData
  }
}

export * from './types'