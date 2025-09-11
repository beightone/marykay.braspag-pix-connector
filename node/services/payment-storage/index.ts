/**
 * Payment Storage Service
 * Handles persistence of payment data in VBase
 * Follows Interface Segregation Principle (ISP)
 */

import { VBase } from '@vtex/api'

import { StoredBraspagPayment } from '../../types/braspag-notifications'
import { VBASE_BUCKETS } from '../../constants/payment-constants'
import {
  PaymentStorage,
  AuthorizationStorage,
  AuthorizationResponseData,
} from './types'

/**
 * VBase implementation of payment storage operations
 */
export class VBasePaymentStorageService implements PaymentStorage {
  constructor(private vbase: VBase) {}

  /**
   * Retrieve stored payment data by payment ID
   */
  public async getStoredPayment(
    paymentId: string
  ): Promise<StoredBraspagPayment | null> {
    try {
      const storedData = await this.vbase.getJSON<StoredBraspagPayment>(
        VBASE_BUCKETS.BRASPAG_PAYMENTS,
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
    data: StoredBraspagPayment
  ): Promise<void> {
    const paymentData: StoredBraspagPayment = {
      ...data,
      lastUpdated: new Date().toISOString(),
    }

    await this.vbase.saveJSON(
      VBASE_BUCKETS.BRASPAG_PAYMENTS,
      paymentId,
      paymentData
    )
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

    const updatedData: StoredBraspagPayment = {
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

/**
 * VBase implementation for authorization response storage
 */
export class VBaseAuthorizationStorageService implements AuthorizationStorage {
  constructor(private vbase: VBase) {}

  /**
   * Save authorization response for test suite
   */
  public async saveAuthorizationResponse(
    response: AuthorizationResponseData
  ): Promise<void> {
    await this.vbase.saveJSON(
      VBASE_BUCKETS.AUTHORIZATIONS,
      response.paymentId,
      response
    )
  }

  /**
   * Retrieve authorization response for test suite
   */
  public async getAuthorizationResponse(
    paymentId: string
  ): Promise<AuthorizationResponseData | null> {
    try {
      const response = await this.vbase.getJSON<AuthorizationResponseData>(
        VBASE_BUCKETS.AUTHORIZATIONS,
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
