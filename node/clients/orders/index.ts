import { OMS } from '@vtex/clients'
// eslint-disable-next-line prettier/prettier
import type { InstanceOptions, IOContext } from '@vtex/api'
import type { AuthMethod, OrderDetailResponse } from '@vtex/clients'

import {
  ExtractedOrderData,
} from './types'

export class OMSClient extends OMS {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(ctx, {
      ...options,
      headers: {
        ...options?.headers,
        VtexIdclientAutCookie: ctx.authToken,
      },
    })
  }

  private readonly defaultAuthMethod: AuthMethod = 'AUTH_TOKEN'

  public async getOrder(id: string): Promise<OrderDetailResponse> {
    return this.order(id, this.defaultAuthMethod)
  }

  public async extractOrderData(orderId: string): Promise<ExtractedOrderData> {
    const order = await this.getOrder(orderId)
    const customApps = order.customData?.customApps ?? []

    // const consultantApp = customApps.find(app => app.id === 'consultant')
    const splitApp = customApps.find(app => app.id === 'splitsimulation')

    const consultantId = '6a1367f1-ca79-40b3-9e4a-d375c8e8ad6c'
    // consultantApp?.fields?.consultantId?.split('_')[1]
    const splitProfitPct = splitApp?.fields?.splitProfitPct
      ? parseFloat(splitApp.fields.splitProfitPct)
      : undefined

    const splitDiscountPct = splitApp?.fields?.splitDiscountPct
      ? parseFloat(splitApp.fields.splitDiscountPct)
      : undefined

    return {
      consultantId,
      splitProfitPct,
      splitDiscountPct,
    }
  }
}

export * from './types'