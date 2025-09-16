import { AuthorizationRequest } from '@vtex/payment-provider'

import {
  CreatePixSaleRequest,
  SplitPaymentEntry,
  Customer,
} from '../clients/braspag/types'
import { customData } from '../__mock__/customData'

/**
 * Configuration options for Braspag PIX adapter
 */
export interface BraspagPixAdapterConfig {
  merchantId: string
  monitfyConsultantId?: string
  notificationUrl?: string
  splitProfitPct?: number
  splitDiscountPct?: number
}

/**
 * Split transaction configuration
 */
export interface SplitTransaction {
  merchantId: string
  amount: number
  commission?: {
    fee?: number
    gateway?: number
  }
}

/**
 * Buyer information interface
 */
export interface BuyerInfo {
  firstName: string
  lastName: string
  document: string
  corporateName?: string
  corporateDocument?: string
  isCorporate: boolean
}

/**
 * Mary Kay custom data structure from VTEX order
 */
export interface MaryKayCustomData {
  customApps?: Array<{
    fields: Record<string, string | undefined>
    id: string
    major: number
  }>
  customFields?: unknown[]
}

/**
 * Extended authorization request with split support and Mary Kay custom data
 */
export interface AuthorizationWithSplits {
  transactionId: string
  value: number
  splits?: SplitTransaction[]
  customData?: MaryKayCustomData
  miniCart: {
    buyer: BuyerInfo
  }
}

/**
 * Builder class for creating Braspag PIX sale requests
 * Follows Builder pattern for complex object construction
 */
export class BraspagPixRequestBuilder {
  private request: Partial<CreatePixSaleRequest> = {}

  constructor(private authorization: AuthorizationWithSplits) {}

  /**
   * Set merchant order ID from transaction
   */
  public setMerchantOrderId(): this {
    this.request.MerchantOrderId = this.authorization.transactionId

    return this
  }

  /**
   * Set customer information from buyer data
   */
  public setCustomer(): this {
    const customer = this.extractCustomerData()

    this.request.Customer = customer

    return this
  }

  public setProvider(): this {
    this.request.Provider = 'Braspag'

    return this
  }

  /**
   * Set payment information with amount and type
   */
  public setPayment(config: BraspagPixAdapterConfig): this {
    const amount = this.convertToAmount()
    const splitPayments = this.createSplitPayments(config, amount)

    this.request.Payment = {
      Type: 'Pix',
      Amount: amount,
      Provider: 'Braspag',
      ...(splitPayments.length > 0 && { SplitPayments: splitPayments }),
    }

    return this
  }

  /**
   * Extract split simulation data from VTEX customData
   */
  private extractSplitSimulation(
    customData?: MaryKayCustomData
  ): {
    splitProfitPct?: number
    splitDiscountPct?: number
  } {
    const splitApp = customData?.customApps?.find(
      app => app.id === 'splitsimulation'
    )

    if (!splitApp?.fields) {
      return {}
    }

    return {
      splitProfitPct: splitApp.fields.splitProfitPct
        ? parseFloat(splitApp.fields.splitProfitPct)
        : undefined,
      splitDiscountPct: splitApp.fields.splitDiscountPct
        ? parseFloat(splitApp.fields.splitDiscountPct)
        : undefined,
    }
  }

  /**
   * Extract consultant data from VTEX customData
   */
  private extractConsultantData(
    customData?: MaryKayCustomData
  ): {
    monitfyConsultantId?: string
    consultantId?: string
  } {
    const retailersApp = customData?.customApps?.find(
      app => app.id === 'retailers'
    )

    if (!retailersApp?.fields?.consultant) {
      return {}
    }

    try {
      const consultantData = JSON.parse(retailersApp.fields.consultant)

      return {
        monitfyConsultantId: consultantData.monitfyConsultantId,
        consultantId: consultantData.consultantId,
      }
    } catch (error) {
      return {}
    }
  }

  /**
   * Build the final request object
   */
  public build(): CreatePixSaleRequest {
    if (
      !this.request.MerchantOrderId ||
      !this.request.Customer ||
      !this.request.Payment
    ) {
      throw new Error('Invalid request: missing required fields')
    }

    const finalRequest = this.request as CreatePixSaleRequest

    return finalRequest
  }

  /**
   * Extract customer data from buyer information
   */
  private extractCustomerData(): Customer {
    const { buyer } = this.authorization.miniCart

    return {
      Name: this.getCustomerName(buyer),
      Identity: this.getCustomerDocument(buyer),
      IdentityType: 'CPF',
    }
  }

  /**
   * Get customer name based on whether it's corporate or individual
   */
  private getCustomerName(buyer: BuyerInfo): string {
    return buyer.isCorporate
      ? buyer.corporateName ?? ''
      : `${buyer.firstName} ${buyer.lastName}`
  }

  /**
   * Get customer document (CPF/CNPJ) cleaned of formatting
   */
  private getCustomerDocument(buyer: BuyerInfo): string {
    const document = buyer.isCorporate
      ? buyer.corporateDocument
      : buyer.document

    return document?.replace(/[^\d]/g, '') ?? ''
  }

  /**
   * Convert value from BRL to cents
   */
  private convertToAmount(): number {
    return Math.round(this.authorization.value * 100)
  }

  /**
   * Create split payments configuration
   */
  private createSplitPayments(
    config: BraspagPixAdapterConfig,
    totalAmount: number
  ): SplitPaymentEntry[] {
    const splitPayments: SplitPaymentEntry[] = []

    if (this.authorization.splits && this.authorization.splits.length > 0) {
      this.authorization.splits.forEach((split: SplitTransaction) => {
        splitPayments.push(this.createSplitPaymentEntry(split))
      })

      return splitPayments
    }

    const splitData = this.extractSplitSimulation(
      customData as MaryKayCustomData
    )

    const consultantData = this.extractConsultantData(
      customData as MaryKayCustomData
    )

    const monitfyConsultantId =
      consultantData.monitfyConsultantId ?? config.monitfyConsultantId

    if (monitfyConsultantId && splitData.splitProfitPct) {
      const consultantPercentage = splitData.splitProfitPct / 100
      const consultantAmount = Math.round(totalAmount * consultantPercentage)
      const marketplaceAmount = totalAmount - consultantAmount

      const consultantSplit = {
        SubordinateMerchantId: '302042D6-F59E-41A8-977F-35659D114C18',
        Amount: consultantAmount,
        Fares: {
          Mdr: 50.0,
          Fee: 100,
        },
      }

      const marketplaceSplit = {
        SubordinateMerchantId: '85C49198-837A-423C-89D0-9087B5D16D49', // Mary Kay's merchant ID
        Amount: marketplaceAmount,
        Fares: {
          Mdr: 50.0,
          Fee: 100,
        },
      }

      splitPayments.push(consultantSplit)
      splitPayments.push(marketplaceSplit)
    }

    return splitPayments
  }

  private createSplitPaymentEntry(split: SplitTransaction): SplitPaymentEntry {
    const splitAmount = Math.round(split.amount * 100)

    return {
      SubordinateMerchantId: split.merchantId,
      Amount: splitAmount,
      Fares: {
        Mdr: split.commission?.fee,
        Fee: split.commission?.gateway,
      },
    }
  }

  // private createDefaultSplitPayment(
  //   merchantId: string,
  //   amount: number
  // ): SplitPaymentEntry {
  //   return {
  //     SubordinateMerchantId: merchantId,
  //     Amount: amount,
  //   }
  // }
}

export class BraspagPixAdapterFactory {
  public static createPixSaleRequest(
    authorization: AuthorizationRequest,
    config: BraspagPixAdapterConfig
  ): CreatePixSaleRequest {
    const authWithSplits = (authorization as unknown) as AuthorizationWithSplits

    const builder = new BraspagPixRequestBuilder(authWithSplits)

    const request = builder
      .setMerchantOrderId()
      .setProvider()
      .setCustomer()
      .setPayment(config)
      .build()

    return request
  }

  public static createPixPaymentAppData(params: {
    qrCodeString?: string
    qrCodeBase64?: string
  }) {
    const { qrCodeString, qrCodeBase64 } = params

    if (!qrCodeString && !qrCodeBase64) {
      return undefined
    }

    const payload = {
      ...(qrCodeString && { code: qrCodeString }),
      ...(qrCodeBase64 && { qrCodeBase64Image: qrCodeBase64 }),
    }

    return {
      appName: 'vtex-payment-app',
      payload: JSON.stringify(payload),
    }
  }
}

export const createBraspagPixSaleRequest =
  BraspagPixAdapterFactory.createPixSaleRequest

export const { createPixPaymentAppData } = BraspagPixAdapterFactory
