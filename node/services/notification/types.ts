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
    retry?: {
      ping: (url: string) => Promise<unknown>
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
