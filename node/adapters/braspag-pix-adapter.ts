import { AuthorizationRequest } from '@vtex/payment-provider'

import {
  CreatePixSaleRequest,
  SplitPaymentEntry,
  Customer,
} from '../clients/braspag/types'
import { customData as customDataMocked } from '../__mock__/customData'
import {
  BraspagPixAdapterConfig,
  AuthorizationWithSplits,
  MaryKayCustomData,
  BuyerInfo,
  SplitTransaction,
} from './types'

const MARY_KAY_SPLIT_CONFIG = {
  CONSULTANT_MERCHANT_ID: 'E28449FA-1268-42BF-B4D3-313BF447285E',
  MARKETPLACE_MERCHANT_ID: '53548187-B270-414B-936E-32EBB2CBBE98',

  DEFAULT_CONSULTANT_PERCENTAGE: 75, // 75%
  DEFAULT_MARKETPLACE_PERCENTAGE: 25, // 25%

  DEFAULT_MDR: 50.0,
  DEFAULT_FEE: 100,
} as const

class MaryKaySplitCalculator {
  /**
   * Calculate split amounts based on total and percentage
   */
  public static calculateSplit(
    totalAmount: number,
    consultantPercentage: number = MARY_KAY_SPLIT_CONFIG.DEFAULT_CONSULTANT_PERCENTAGE
  ): { consultantAmount: number; marketplaceAmount: number } {
    const consultantAmount = Math.round(
      totalAmount * (consultantPercentage / 100)
    )

    const marketplaceAmount = totalAmount - consultantAmount

    return { consultantAmount, marketplaceAmount }
  }

  /**
   * Create consultant split entry
   */
  public static createConsultantSplit(amount: number): SplitPaymentEntry {
    return {
      SubordinateMerchantId: MARY_KAY_SPLIT_CONFIG.CONSULTANT_MERCHANT_ID,
      Amount: amount,
      Fares: {
        Mdr: MARY_KAY_SPLIT_CONFIG.DEFAULT_MDR,
        Fee: MARY_KAY_SPLIT_CONFIG.DEFAULT_FEE,
      },
    }
  }

  /**
   * Create marketplace split entry
   */
  public static createMarketplaceSplit(amount: number): SplitPaymentEntry {
    return {
      SubordinateMerchantId: MARY_KAY_SPLIT_CONFIG.MARKETPLACE_MERCHANT_ID,
      Amount: amount,
      Fares: {
        Mdr: MARY_KAY_SPLIT_CONFIG.DEFAULT_MDR,
        Fee: MARY_KAY_SPLIT_CONFIG.DEFAULT_FEE,
      },
    }
  }
}

/**
 * Builder class for creating Braspag PIX sale requests
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
    _config: BraspagPixAdapterConfig,
    totalAmount: number
  ): SplitPaymentEntry[] {
    if (this.authorization.splits && this.authorization.splits.length > 0) {
      return this.authorization.splits.map(split =>
        this.createSplitPaymentEntry(split)
      )
    }

    return this.createMaryKaySplitPayments(totalAmount)
  }

  private createMaryKaySplitPayments(totalAmount: number): SplitPaymentEntry[] {
    const splitData = this.extractSplitSimulation(
      customDataMocked as MaryKayCustomData
    )

    const consultantPercentage =
      splitData.splitProfitPct ??
      MARY_KAY_SPLIT_CONFIG.DEFAULT_CONSULTANT_PERCENTAGE

    const {
      consultantAmount,
      marketplaceAmount,
    } = MaryKaySplitCalculator.calculateSplit(totalAmount, consultantPercentage)

    return [
      MaryKaySplitCalculator.createConsultantSplit(consultantAmount),
      MaryKaySplitCalculator.createMarketplaceSplit(marketplaceAmount),
    ]
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
      appName: 'marykayhomolog.braspag-pix-authorization',
      payload: JSON.stringify(payload),
    }
  }
}

export const createBraspagPixSaleRequest =
  BraspagPixAdapterFactory.createPixSaleRequest

export const { createPixPaymentAppData } = BraspagPixAdapterFactory
