export interface NotificationContext {
  status: number
  body: unknown
  vtex: {
    account: string
  }
  clients: {
    vbase: {
      getJSON: <T>(
        bucket: string,
        key: string,
        nullIfNotFound?: boolean
      ) => Promise<T | null>
      saveJSON: (bucket: string, key: string, data: unknown) => Promise<void>
    }
    storeServices?: {
      forwardBraspagNotification: (notification: unknown) => Promise<unknown>
    }
    braspag?: {
      queryPixStatus: (paymentId: string) => Promise<unknown>
    }
    vtexGateway?: {
      approvePayment: (
        account: string,
        transactionId: string,
        paymentId: string,
        data: {
          paymentId: string
          authorizationId: string
          status: 'approved' | 'denied'
          code: string
          message: string
          tid: string
        }
      ) => Promise<unknown>
    }
  }
  request: {
    body: unknown
  }
}

export interface NotificationHandler {
  canHandle(notification: unknown): boolean
  handle(notification: unknown, context: NotificationContext): Promise<void>
}
