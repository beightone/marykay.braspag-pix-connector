import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

import { SimulateSplitRequest, SimulateSplitResponse } from './types'

export class StoreServicesClient extends ExternalClient {
  constructor(context: IOContext, options?: InstanceOptions) {
    super('', context, {
      ...options,
      headers: {
        ...options?.headers,
        'X-VTEX-USE-HTTPS': 'true',
      },
    })
  }

  public async simulateSplit(payload: SimulateSplitRequest) {
    const { logger } = this.context as any

    console.log('STORE_SERVICES: Starting split simulation', {
      monitfyConsultantId: payload.monitfyConsultantId,
      orderFormId: payload.orderFormId,
      workspace: this.context.workspace,
      account: this.context.account
    })

    try {
      logger?.info('STORE_SERVICES_SIMULATE_SPLIT_REQUEST', {
        monitfyConsultantId: payload.monitfyConsultantId,
        orderFormId: payload.orderFormId,
      })

      const url = `http://${this.context.workspace}--${this.context.account}.myvtex.com/_v/split/simulate`
      
      console.log('STORE_SERVICES: Making request to', { url })

      const response = await this.http.post<SimulateSplitResponse>(
        url,
        payload
      )

      console.log('STORE_SERVICES: Split simulation successful', {
        monitfyConsultantId: payload.monitfyConsultantId,
        splitProfitPct: response.splitProfitPct,
        splitDiscountPct: response.splitDiscountPct
      })

      logger?.info('STORE_SERVICES_SIMULATE_SPLIT_SUCCESS', {
        monitfyConsultantId: payload.monitfyConsultantId,
        splitProfitPct: response.splitProfitPct,
        splitDiscountPct: response.splitDiscountPct,
      })

      return response
    } catch (error) {
      console.log('STORE_SERVICES: Split simulation failed', {
        monitfyConsultantId: payload.monitfyConsultantId,
        error: error instanceof Error ? error.message : error
      })

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
        `http://${this.context.workspace}--${this.context.account}.myvtex.com/_v/notifications/braspag`,
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
}
