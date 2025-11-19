import { ExternalClient, IOContext, InstanceOptions } from '@vtex/api'

interface BraspagQueryCredentials {
  merchantId?: string
  merchantKey?: string
}

export class BraspagQueryClient extends ExternalClient {
  private merchantId: string
  private merchantKey: string

  constructor(
    context: IOContext & { settings?: BraspagQueryCredentials },
    options?: InstanceOptions
  ) {
    super('https://apiquery.braspag.com.br', context, {
      ...options,
      headers: {
        ...options?.headers,
        'Content-Type': 'application/json',
      },
    })

    const credentials = context.settings
    this.merchantId =
      credentials?.merchantId ?? 'D23429C6-4CDC-484E-9DFA-A8ECD5EA539C'
    this.merchantKey =
      credentials?.merchantKey ?? 'xt0OGmUl2gTzL0QNp4f9TzcynlpihIxZk5h06779'
  }

  public getTransactionByPaymentId<T = unknown>(paymentId: string) {
    return this.http.get<T>(`/v2/sales/${paymentId}`, {
      headers: {
        MerchantId: this.merchantId,
        MerchantKey: this.merchantKey,
      },
    })
  }
}
