import { AuthorizationRequest } from '@vtex/payment-provider'

import {
  CreatePixSaleRequest,
  SplitPaymentEntry,
  Customer,
} from '../clients/braspag/types'

/**
 * Configuration options for Braspag PIX adapter
 */
export interface BraspagPixAdapterConfig {
  merchantId: string
  monitfyConsultantId?: string
  notificationUrl?: string
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
 * Extended authorization request with split support
 */
export interface AuthorizationWithSplits {
  transactionId: string
  value: number
  splits?: SplitTransaction[]
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
      ...(config.notificationUrl && {
        NotificationUrl: config.notificationUrl,
      }),
    }

    return this
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

    return this.request as CreatePixSaleRequest
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
    } else if (config.monitfyConsultantId) {
      splitPayments.push(
        this.createDefaultSplitPayment(config.monitfyConsultantId, totalAmount)
      )
    }

    return splitPayments
  }

  /**
   * Create a split payment entry from split transaction
   */
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

  /**
   * Create default split payment when no splits are specified
   */
  private createDefaultSplitPayment(
    merchantId: string,
    amount: number
  ): SplitPaymentEntry {
    return {
      SubordinateMerchantId: merchantId,
      Amount: amount,
    }
  }
}

/**
 * Factory class for creating Braspag PIX adapters
 */
export class BraspagPixAdapterFactory {
  /**
   * Create a PIX sale request using the builder pattern
   */
  public static createPixSaleRequest(
    authorization: AuthorizationRequest,
    config: BraspagPixAdapterConfig
  ): CreatePixSaleRequest {
    const authWithSplits = (authorization as unknown) as AuthorizationWithSplits

    return new BraspagPixRequestBuilder(authWithSplits)
      .setMerchantOrderId()
      .setCustomer()
      .setPayment(config)
      .build()
  }

  /**
   * Create PIX payment app data for QR code display
   */
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

// Backward compatibility exports
export const createBraspagPixSaleRequest =
  BraspagPixAdapterFactory.createPixSaleRequest

export const { createPixPaymentAppData } = BraspagPixAdapterFactory
