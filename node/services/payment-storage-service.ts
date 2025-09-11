/**
 * Payment Storage Service
 * Handles persistence of payment data in VBase
 * Follows Interface Segregation Principle (ISP)
 */

import { VBase } from '@vtex/api'

export interface StoredPaymentData {
  pixPaymentId: string
  braspagTransactionId?: string
  merchantOrderId: string
  status?: number
  type: string
  cancelledAt?: string
  lastUpdated?: string
}

export interface PaymentReader {
  getStoredPayment(paymentId: string): Promise<StoredPaymentData | null>
}

export interface PaymentWriter {
  savePaymentData(paymentId: string, data: StoredPaymentData): Promise<void>
  updatePaymentStatus(paymentId: string, status: number): Promise<void>
}

export interface PaymentStorage extends PaymentReader, PaymentWriter {}

/**
 * VBase implementation of payment storage operations
 */
export class VBasePaymentStorageService implements PaymentStorage {
  private readonly BUCKET_NAME = 'braspag-payments'

  constructor(private vbase: VBase) {}

  /**
   * Retrieve stored payment data by payment ID
   */
  public async getStoredPayment(
    paymentId: string
  ): Promise<StoredPaymentData | null> {
    try {
      const storedData = await this.vbase.getJSON<StoredPaymentData>(
        this.BUCKET_NAME,
        paymentId,
        true
      )

      return storedData
    } catch (error) {
      // Return null if payment not found or other error
      return null
    }
  }

  /**
   * Save payment data to storage
   */
  public async savePaymentData(
    paymentId: string,
    data: StoredPaymentData
  ): Promise<void> {
    const paymentData: StoredPaymentData = {
      ...data,
      lastUpdated: new Date().toISOString(),
    }

    await this.vbase.saveJSON(this.BUCKET_NAME, paymentId, paymentData)
  }

  /**
   * Update payment status for existing payment
   */
  public async updatePaymentStatus(
    paymentId: string,
    status: number
  ): Promise<void> {
    const existingData = await this.getStoredPayment(paymentId)

    if (!existingData) {
      throw new Error(`Payment not found: ${paymentId}`)
    }

    const updatedData: StoredPaymentData = {
      ...existingData,
      status,
      lastUpdated: new Date().toISOString(),
    }

    await this.savePaymentData(paymentId, updatedData)
  }
}

/**
 * Authorization response storage operations
 */
export interface AuthorizationStorage {
  saveAuthorizationResponse(response: AuthorizationResponseData): Promise<void>
  getAuthorizationResponse(
    paymentId: string
  ): Promise<AuthorizationResponseData | null>
}

export interface AuthorizationResponseData {
  paymentId: string
  status: string
  code?: string
  message?: string
  tid?: string
  paymentAppData?: unknown
}

/**
 * VBase implementation for authorization response storage
 */
export class VBaseAuthorizationStorageService implements AuthorizationStorage {
  private readonly BUCKET_NAME = 'authorizations'

  constructor(private vbase: VBase) {}

  /**
   * Save authorization response for test suite
   */
  public async saveAuthorizationResponse(
    response: AuthorizationResponseData
  ): Promise<void> {
    await this.vbase.saveJSON(this.BUCKET_NAME, response.paymentId, response)
  }

  /**
   * Retrieve authorization response for test suite
   */
  public async getAuthorizationResponse(
    paymentId: string
  ): Promise<AuthorizationResponseData | null> {
    try {
      const response = await this.vbase.getJSON<AuthorizationResponseData>(
        this.BUCKET_NAME,
        paymentId,
        true
      )

      return response
    } catch (error) {
      return null
    }
  }
}

/**
 * Factory for creating storage service instances
 */
export class PaymentStorageServiceFactory {
  /**
   * Create payment storage service with VBase
   */
  public static createPaymentStorage(vbase: VBase): VBasePaymentStorageService {
    return new VBasePaymentStorageService(vbase)
  }

  /**
   * Create authorization storage service with VBase
   */
  public static createAuthorizationStorage(
    vbase: VBase
  ): VBaseAuthorizationStorageService {
    return new VBaseAuthorizationStorageService(vbase)
  }
}
