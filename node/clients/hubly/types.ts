export interface HublyConsultantResponse {
  id: string
  user: {
    username: string
    email: string
    document: string
    phone: string
    avatar: string
  }
  marketingData: {
    utmSource: string
    utmCampaign: string
  }
  additionalInfo: Array<{
    key: string
    value: string
  }>
  affiliateStoreUrl: string
  commission: number
  active: boolean
}

export interface HublyClientConfig {
  apiKey: string
  organizationId: string
}

