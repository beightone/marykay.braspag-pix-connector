import { StoredBraspagPayment } from '../../types/braspag-notifications'

export interface PaymentReader {
  getStoredPayment(paymentId: string): Promise<StoredBraspagPayment | null>
}

export interface PaymentWriter {
  savePaymentData(paymentId: string, data: StoredBraspagPayment): Promise<void>
  updatePaymentStatus(paymentId: string, status: number): Promise<void>
}

export interface PaymentStorage extends PaymentReader, PaymentWriter {}

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
