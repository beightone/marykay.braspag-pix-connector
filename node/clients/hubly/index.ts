import { ExternalClient, InstanceOptions, IOContext } from '@vtex/api'

import { HublyConsultantResponse } from './types'

const HUBLY_BASE_URL = 'https://external.gohubly.com'
const DEFAULT_ORGANIZATION_ID = 'a1f197a1-559c-4114-b6e2-d646a367fc5c'

export class HublyClient extends ExternalClient {
  constructor(ctx: IOContext, options?: InstanceOptions) {
    super(HUBLY_BASE_URL, ctx, options)
  }

  public async getConsultantData(
    consultantId: string,
    apiKey = 'f7bc2b123991ae43d6a38cdfcbe77d52522d923cc5d289cafe3ffbf7530fe500',
    organizationId: string = DEFAULT_ORGANIZATION_ID
  ): Promise<HublyConsultantResponse> {
    const path = `/api/organizations/${organizationId}/affiliates/${consultantId}`

    return this.http.get<HublyConsultantResponse>(path, {
      headers: {
        'x-hubly-key': apiKey,
      },
    })
  }

  public getBraspagIdFromConsultant(
    consultant: HublyConsultantResponse
  ): string | undefined {
    const braspagInfo = consultant.additionalInfo.find(info => {
      const k = (info.key || info.name || '').toLowerCase().trim()

      return k === 'braspag id'
    })

    return braspagInfo?.value
  }
}

export * from './types'
