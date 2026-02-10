import { AuthorizationRequest } from '@vtex/payment-provider'

import {
  CreatePixSaleRequest,
  SplitPaymentEntry,
  Customer,
} from '../clients/braspag/types'
import {
  BraspagPixAdapterConfig,
  AuthorizationWithSplits,
  BuyerInfo,
} from './types'
import { DatadogCompatibleLogger } from '../tools/datadog/logger.types'

const MARY_KAY_SPLIT_CONFIG = {
  MARKETPLACE_MERCHANT_ID: 'D23429C6-4CDC-484E-9DFA-A8ECD5EA539C',

  DEFAULT_MDR: 50.0,
  DEFAULT_FEE: 100,
} as const

class MaryKaySplitCalculator {
  public static calculateSplit(
    totalAmount: number,
    maryKayPercentage: number
  ): { maryKayAmount: number; consultantAmount: number } {
    const maryKayAmount = Math.round(totalAmount * (maryKayPercentage / 100))
    const consultantAmount = totalAmount - maryKayAmount

    return { maryKayAmount, consultantAmount }
  }

  public static createMaryKaySplit(amount: number): SplitPaymentEntry {
    return {
      SubordinateMerchantId: MARY_KAY_SPLIT_CONFIG.MARKETPLACE_MERCHANT_ID,
      Amount: amount,
      Fares: {
        Mdr: MARY_KAY_SPLIT_CONFIG.DEFAULT_MDR,
        Fee: MARY_KAY_SPLIT_CONFIG.DEFAULT_FEE,
      },
    }
  }

  // eslint-disable-next-line max-params
  public static createConsultantSplit(
    amount: number,
    subordinateMerchantId: string,
    mdr = 0,
    fee = 0
  ): SplitPaymentEntry {
    return {
      SubordinateMerchantId: subordinateMerchantId,
      Amount: amount,
      Fares: {
        Mdr: mdr,
        Fee: fee,
      },
    }
  }

  public static createMaryKayShippingSplit(amount: number): SplitPaymentEntry {
    return {
      SubordinateMerchantId: MARY_KAY_SPLIT_CONFIG.MARKETPLACE_MERCHANT_ID,
      Amount: amount,
      Fares: {
        Mdr: 0,
        Fee: 0,
      },
    }
  }
}

/**
 * Builder class for creating Braspag PIX sale requests
 */
export class BraspagPixRequestBuilder {
  private request: Partial<CreatePixSaleRequest> = {}
  private logger?: DatadogCompatibleLogger

  constructor(
    private authorization: AuthorizationWithSplits,
    logger?: DatadogCompatibleLogger
  ) {
    this.logger = logger
  }

  /**
   * Set merchant order ID, preferring explicit config orderId when provided
   */
  public setMerchantOrderId(orderId?: string): this {
    this.request.MerchantOrderId = orderId ?? this.authorization.orderId

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
    const splitPayments = this.createSplitPayments(config, amount, this.logger)

    this.request.Payment = {
      Type: 'Pix',
      Amount: amount,
      Provider: 'Braspag',
      NotificationUrl: config.notificationUrl,
      ...(splitPayments.length > 0 && { SplitPayments: splitPayments }),
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
    totalAmount: number,
    logger?: DatadogCompatibleLogger
  ): SplitPaymentEntry[] {
    const subordinateMerchantId = config.braspagId ?? config.monitfyConsultantId

    if (!subordinateMerchantId) {
      if (logger) {
        logger.warn('PIX.SPLIT.SKIPPED_NO_MERCHANT', {
          flow: 'authorization',
          action: 'split_skipped_no_merchant_id',
          hasBraspagId: !!config.braspagId,
          hasConsultantId: !!config.monitfyConsultantId,
          totalAmountCents: totalAmount,
        })
      }

      return []
    }

    const shippingValue = config.shippingValue ?? 0
    const shippingAmount = Math.min(shippingValue, totalAmount)
    const consultantAmount = totalAmount - shippingAmount

    if (consultantAmount <= 0) {
      if (logger) {
        logger.warn('PIX.SPLIT.SKIPPED_ZERO_CONSULTANT', {
          flow: 'authorization',
          action: 'split_skipped_zero_consultant_amount',
          totalAmountCents: totalAmount,
          shippingAmountCents: shippingAmount,
          consultantAmountCents: consultantAmount,
        })
      }

      return []
    }

    const splits: SplitPaymentEntry[] = []

    splits.push(
      MaryKaySplitCalculator.createConsultantSplit(
        consultantAmount,
        subordinateMerchantId,
        config.mdr ?? 0,
        config.fee ?? 0
      )
    )

    if (shippingAmount > 0) {
      splits.push(
        MaryKaySplitCalculator.createMaryKayShippingSplit(shippingAmount)
      )
    }

    if (logger) {
      logger.info('PIX.SPLIT.CALCULATED', {
        flow: 'authorization',
        action: 'split_calculated',
        totalAmountCents: totalAmount,
        consultantAmountCents: consultantAmount,
        shippingAmountCents: shippingAmount,
        subordinateMerchantId,
        splitCount: splits.length,
        mdr: config.mdr ?? 0,
        fee: config.fee ?? 0,
      })
    }

    return splits
  }
}

export class BraspagPixAdapterFactory {
  public static createPixSaleRequest(
    authorization: AuthorizationRequest,
    config: BraspagPixAdapterConfig,
    logger?: DatadogCompatibleLogger
  ): CreatePixSaleRequest {
    const authWithSplits = (authorization as unknown) as AuthorizationWithSplits

    const builder = new BraspagPixRequestBuilder(authWithSplits, logger)

    const request = builder
      .setMerchantOrderId(config.orderId)
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
      ...(qrCodeString && { code: qrCodeString, qrCodeString }),
      ...(qrCodeBase64 && {
        qrCodeBase64Image: qrCodeBase64,
        qrCodeBase64,
      }),
    }

    return {
      appName: 'vtex.pix-payment',
      payload: JSON.stringify(payload),
    }
  }
}

export const createBraspagPixSaleRequest = (
  authorization: AuthorizationRequest,
  config: BraspagPixAdapterConfig,
  logger?: DatadogCompatibleLogger
) =>
  BraspagPixAdapterFactory.createPixSaleRequest(authorization, config, logger)

export const { createPixPaymentAppData } = BraspagPixAdapterFactory
