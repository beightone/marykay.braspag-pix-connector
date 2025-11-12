import { StoredBraspagPayment } from '../../types/braspag-notifications'

export interface PaymentReader {
  getStoredPayment(paymentId: string): Promise<StoredBraspagPayment | null>
}

export interface PaymentWriter {
  savePaymentData(paymentId: string, data: StoredBraspagPayment): Promise<void>
  updatePaymentStatus(paymentId: string, status: number): Promise<void>
}

export interface PaymentStorage extends PaymentReader, PaymentWriter {}

// Authorization storage interfaces removed as they are no longer used
