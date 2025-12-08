import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import {
  EncryptOrderInfosRequest,
  EncryptOrderInfosResponse,
  SimulateSplitRequest,
  SimulateSplitResponse,
} from './types'

export class StoreServicesClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('', context, {
      ...options,
      headers: {
        ...options?.headers,
      },
    })
  }

  public async simulateSplit(payload: SimulateSplitRequest) {
    const { logger } = this.context as any

    try {
      logger?.info('STORE_SERVICES_SIMULATE_SPLIT_REQUEST', {
        monitfyConsultantId: payload.monitfyConsultantId,
        orderFormId: payload.orderFormId,
      })

      const url = `https://${this.context.workspace}--${this.context.account}.myvtex.com/_v/split/simulate`

      const response = await this.http.post<SimulateSplitResponse>(url, payload)

      logger?.info('STORE_SERVICES_SIMULATE_SPLIT_SUCCESS', {
        monitfyConsultantId: payload.monitfyConsultantId,
        splitProfitPct: response.splitProfitPct,
        splitDiscountPct: response.splitDiscountPct,
      })

      return response
    } catch (error) {
      logger?.error('STORE_SERVICES_SIMULATE_SPLIT_FAILED', {
        monitfyConsultantId: payload.monitfyConsultantId,
        error: error instanceof Error ? error.message : error,
      })

      throw error
    }
  }

  public async forwardBraspagNotification(notification: unknown) {
    const { logger } = this.context as any

    try {
      logger?.info('STORE_SERVICES_FORWARD_NOTIFICATION_REQUEST', {
        notification,
      })

      const response = await this.http.post(
        `https://${this.context.workspace}--${this.context.account}.myvtex.com/_v/notifications/braspag`,
        notification
      )

      logger?.info('STORE_SERVICES_FORWARD_NOTIFICATION_SUCCESS', {
        notification,
      })

      return response
    } catch (error) {
      logger?.error('STORE_SERVICES_FORWARD_NOTIFICATION_FAILED', {
        notification,
        error: error instanceof Error ? error.message : error,
      })
      throw error
    }
  }

  public async encryptOrderInfos(payload: EncryptOrderInfosRequest) {
    const { logger } = this.context as any

    try {
      logger?.info('STORE_SERVICES_ENCRYPT_ORDER_INFOS_REQUEST', {
        orderId: payload.orderId,
        consultantCode: payload.consultantCode,
      })

      const url = `https://${this.context.workspace}--${this.context.account}.myvtex.com/_v/encrypt`

      const response = await this.http.post<EncryptOrderInfosResponse>(
        url,
        payload
      )

      logger?.info('STORE_SERVICES_ENCRYPT_ORDER_INFOS_SUCCESS', {
        orderId: payload.orderId,
      })

      return response
    } catch (error) {
      logger?.error('STORE_SERVICES_ENCRYPT_ORDER_INFOS_FAILED', {
        orderId: payload.orderId,
        error: error instanceof Error ? error.message : error,
      })

      throw error
    }
  }
}
