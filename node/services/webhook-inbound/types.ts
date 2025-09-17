export interface VBaseClient {
  getJSON: <T>(
    bucket: string,
    key: string,
    nullIfNotFound?: boolean
  ) => Promise<T>
  saveJSON: (bucket: string, key: string, data: unknown) => Promise<void>
}

export interface WebhookRequest {
  body: unknown
  headers?: Record<string, string>
}

export interface WebhookResponse {
  status: number
  body: unknown
}

export interface WebhookInboundProvider {
  processWebhook(
    request: WebhookRequest,
    vbaseClient: VBaseClient
  ): Promise<WebhookResponse>
}
