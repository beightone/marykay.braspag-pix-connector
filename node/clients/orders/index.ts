import { OMS } from '@vtex/clients'
import type { InstanceOptions, IOContext } from '@vtex/api'
import type { AuthMethod, OrderDetailResponse } from '@vtex/clients'

import { ExtractedOrderData } from './types'
import { HublyClient } from '../hubly'
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'

export class OMSClient extends OMS {
  private hublyClient: HublyClient

  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
    })

    this.hublyClient = new HublyClient(ctx, options)
  }

  private readonly defaultAuthMethod: AuthMethod = 'AUTH_TOKEN'

  public async getOrder(id: string): Promise<OrderDetailResponse> {
    return this.order(id, this.defaultAuthMethod)
  }

  public async cancelOrderInVtex(orderId: string, reason?: string): Promise<void> {
    const cancelReason = reason ?? 'Reembolso via voucher'
    const startTime = Date.now()

    console.log('OMS_CLIENT: Cancelling order in VTEX', {
      orderId,
      reason: cancelReason,
      endpoint: `/api/oms/pvt/orders/${orderId}/cancel`,
      timestamp: new Date().toISOString(),
    })

    try {
      await this.http.post(
        `/api/oms/pvt/orders/${orderId}/cancel`,
        { reason: cancelReason },
        {
          metric: 'oms-cancel-order',
          timeout: 10000,
        }
      )

      const duration = Date.now() - startTime

      console.log('OMS_CLIENT: Order cancelled successfully', {
        orderId,
        reason: cancelReason,
        duration,
      })
    } catch (error) {
      const duration = Date.now() - startTime
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      console.error('OMS_CLIENT: Failed to cancel order', {
        error: errorMsg,
        stack: errorStack,
        orderId,
        reason: cancelReason,
        duration,
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

    logger?.info('ORDER_EXTRACT: Totals extracted', {
      itemsSubtotal,
      discountsSubtotal,
      shippingValue,
      totalValue: order.value,
    })

    let couponDiscount = 0
    const couponCode = (order as any)?.marketingData?.coupon as string | undefined
    const rateIds = (order as any)?.ratesAndBenefitsData?.rateAndBenefitsIdentifiers as
      | Array<{ id: string; matchedParameters: Record<string, string> }>
      | undefined

    const couponPromotionId = rateIds?.find(
      (p) => p.matchedParameters?.['couponCode@Marketing'] === couponCode
    )?.id

    logger?.info('ORDER_EXTRACT: Coupon analysis', {
      couponCode,
      couponPromotionId,
      rateIdsCount: rateIds?.length ?? 0,
      shippingValue,
      discountsSubtotal,
    })

    if (couponPromotionId) {
      const items = (order.items as any[]) || []

      couponDiscount = items.reduce((acc: number, item: any) => {
        const priceTags: Array<{ identifier?: string; value: number }> =
          (item.priceTags as any[]) || []

        const tag = priceTags.find((t) => t.identifier === couponPromotionId)

        if (!tag) return acc

        return (acc as number) + Math.abs((tag.value ?? 0) as number)
      }, 0)

      logger?.info('ORDER_EXTRACT: Coupon discount calculated', {
        couponDiscount,
        isFreeShipping: shippingValue === 0 && couponDiscount > 0,
      })
    }

    let braspagId: string | undefined

    if (consultantId) {
      try {
        const apiKey = hublyConfig?.apiKey
        const organizationId = hublyConfig?.organizationId

        console.log('HUBLY: Fetching consultant data', {
          consultantId,
          organizationId,
          hasApiKey: !!apiKey,
          willUseDefaults: !apiKey,
        })

        const consultantData = await this.hublyClient.getConsultantData(
          consultantId,
          apiKey,
          organizationId
        )

        console.log('HUBLY: Consultant data received', {
          consultantId,
          additionalInfoCount: consultantData.additionalInfo?.length ?? 0,
        })

        braspagId = this.hublyClient.getBraspagIdFromConsultant(consultantData)

        console.log('HUBLY: Braspag ID extracted', {
          consultantId,
          braspagId,
        })
      } catch (error) {
        console.error('HUBLY: Failed to fetch consultant data', {
          consultantId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      console.log('HUBLY: Skipping fetch - missing consultantId')
    }

    const isFreeShippingCoupon = shippingValue === 0 && couponDiscount > 0

    if (isFreeShippingCoupon) {
      logger?.info('ORDER_EXTRACT: Free shipping coupon detected - resetting couponDiscount to 0', {
        originalCouponDiscount: couponDiscount,
        shippingValue,
        message: 'Split will use 75% Mary Kay / 25% Consultant (no adjustment)',
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

    logger?.info('ORDER_EXTRACT: Final order data', extractedData)

    return extractedData
  }
}

export * from './types'