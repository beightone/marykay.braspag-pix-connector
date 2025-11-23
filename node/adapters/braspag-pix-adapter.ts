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
import { calculateCommissions } from '../helpers/payment-split/calculate-commissions'
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

  public static createConsultantSplit(
    amount: number,
    subordinateMerchantId: string
  ): SplitPaymentEntry {
    return {
      SubordinateMerchantId: subordinateMerchantId,
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
  private logger?: DatadogCompatibleLogger

  constructor(
    private authorization: AuthorizationWithSplits,
    logger?: DatadogCompatibleLogger
  ) {
    this.logger = logger
  }

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

    if (logger) {
      logger.info('[BRASPAG_ADAPTER] Creating split payments', {
        flow: 'authorization',
        action: 'create_split_payments',
        braspagId: config.braspagId,
        monitfyConsultantId: config.monitfyConsultantId,
        subordinateMerchantId,
        splitProfitPct: config.splitProfitPct,
      })
    }

    if (!subordinateMerchantId || !config.splitProfitPct) {
      if (logger) {
        logger.warn('[BRASPAG_ADAPTER] Skipping split - missing data', {
          flow: 'authorization',
          action: 'skip_split_missing_data',
          hasSubordinateMerchantId: !!subordinateMerchantId,
          hasSplitProfitPct: !!config.splitProfitPct,
        })
      }

      return []
    }

    const totalTaxes = config.totalTaxes ?? 5
    const splitProfitPct = config.splitProfitPct ?? 0
    const subordinateRaw = Math.max(0, Math.min(100, splitProfitPct - totalTaxes))
    const masterRaw = Math.max(0, Math.min(100, 100 - subordinateRaw))

    if (logger) {
      logger.info('[BRASPAG_ADAPTER] Calculating raw commissions', {
        flow: 'authorization',
        action: 'calculate_raw_commissions',
        splitProfitPct,
        totalTaxes,
        subordinateRaw,
        masterRaw,
        isFreeShippingCoupon: config.isFreeShippingCoupon ?? false,
        isConsultantCoupon: config.isConsultantCoupon ?? false,
      })
    }

    const adjusted = calculateCommissions(
      {
        totalItemsAmount: config.itemsSubtotal ?? totalAmount,
        totalDiscountAmount: config.discountsSubtotal ?? 0,
        couponDiscountAmount: config.couponDiscount ?? 0,
      },
      { master: masterRaw, subordinate: subordinateRaw },
      !(config.isConsultantCoupon ?? false),
      config.isFreeShippingCoupon ?? false,
      this.logger
    )

    if (logger) {
      logger.info('[BRASPAG_ADAPTER] Commissions adjusted', {
        flow: 'authorization',
        action: 'commissions_adjusted',
        rawMaster: masterRaw,
        rawSubordinate: subordinateRaw,
        adjustedMaster: adjusted.master,
        adjustedSubordinate: adjusted.subordinate,
        totalItemsAmount: config.itemsSubtotal ?? totalAmount,
        totalDiscountAmount: config.discountsSubtotal ?? 0,
        couponDiscountAmount: config.couponDiscount ?? 0,
        isFreeShippingCoupon: config.isFreeShippingCoupon ?? false,
        isConsultantCoupon: config.isConsultantCoupon ?? false,
      })
    }

    const shippingValue = config.shippingValue ?? 0
    const netAmount = Math.max(0, totalAmount - shippingValue)

    const consultantAmount = Math.round(
      netAmount * (adjusted.subordinate / 100)
    )

    const maryKayAmount = totalAmount - consultantAmount

    if (logger) {
      logger.info('[BRASPAG_ADAPTER] Split amounts calculated', {
        flow: 'authorization',
        action: 'split_amounts_calculated',
        totalAmount,
        shippingValue,
        netAmount,
        consultantAmount,
        maryKayAmount,
        consultantPercentage: (consultantAmount / totalAmount) * 100,
        maryKayPercentage: (maryKayAmount / totalAmount) * 100,
        totalSplit: consultantAmount + maryKayAmount,
        difference: totalAmount - (consultantAmount + maryKayAmount),
        adjustedSubordinate: adjusted.subordinate,
        adjustedMaster: adjusted.master,
      })
    }

    const splits = [
      MaryKaySplitCalculator.createMaryKaySplit(maryKayAmount),
      MaryKaySplitCalculator.createConsultantSplit(
        consultantAmount,
        subordinateMerchantId
      ),
    ]

    if (logger) {
      logger.info('[BRASPAG_ADAPTER] Split payments created', {
        flow: 'authorization',
        action: 'split_payments_created',
        splits: splits.map(split => ({
          subordinateMerchantId: split.SubordinateMerchantId,
          amount: split.Amount,
          mdr: split.Fares?.Mdr,
          fee: split.Fares?.Fee,
        })),
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
) => BraspagPixAdapterFactory.createPixSaleRequest(authorization, config, logger)

export const { createPixPaymentAppData } = BraspagPixAdapterFactory

