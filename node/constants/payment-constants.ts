/**
 * Payment connector constants
 * Centralizes all magic numbers and configuration values
 */

// Timeouts and retry configuration
export const TIMEOUT_CONFIG = {
  BRASPAG_REQUEST_TIMEOUT: 30000, // 30 seconds
  BRASPAG_RETRIES: 3,
} as const

// Payment delays
export const PAYMENT_DELAYS = {
  PIX_CANCEL_TIMEOUT: 2 * 60 * 60 * 1000, // 2 hours - Matches Braspag PIX QR code expiration
  AUTO_SETTLE_DELAY: 2 * 60 * 60 * 1000, // 2 hours - Same as PIX QR code lifetime
  AUTO_SETTLE_AFTER_ANTIFRAUD: 2 * 60 * 1000, // 2 minutes
  PIX_EXPIRATION_SECONDS: 7200, // 2 hours in seconds - Braspag PIX QR code lifetime
} as const

// PIX timing thresholds (in milliseconds)
export const PIX_TIMING = {
  LATE_PAYMENT_THRESHOLD: 90 * 60 * 1000, // 90 minutes - warn if payment is close to expiring
  EXPIRED_THRESHOLD: 2 * 60 * 60 * 1000, // 2 hours - PIX QR code expired
} as const

// Braspag payment status codes
export const BRASPAG_STATUS = {
  NOT_FINISHED: 0,
  PENDING: 1,
  PAID: 2,
  DENIED: 3,
  VOIDED: 10,
  REFUNDED: 11,
  PENDING_AUTHORIZATION: 12,
  ABORTED: 13,
  SCHEDULED: 20,
} as const

// VBase bucket names
export const VBASE_BUCKETS = {
  AUTHORIZATIONS: 'authorizations',
  BRASPAG_PAYMENTS: 'payments',
} as const

// Payment types
export const PAYMENT_TYPES = {
  PIX: 'pix',
} as const

// Error codes
export const ERROR_CODES = {
  PAID: 'PAID',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN',
  DENIED: 'DENIED',
  PENDING: 'PENDING',
} as const

// Response messages
export const RESPONSE_MESSAGES = {
  PIX_CREATED: 'PIX payment created successfully',
  PIX_CANCELLED: 'PIX payment cancellation requested successfully',
  PIX_ALREADY_CANCELLED: 'PIX payment already cancelled',
  PIX_SETTLED: 'PIX payment successfully settled',
  PIX_CANNOT_CANCEL_PAID: 'PIX payment cannot be cancelled - already paid',
  PIX_CANNOT_SETTLE: 'PIX payment cannot be settled',
  PIX_NOT_READY_FOR_SETTLEMENT: 'PIX payment not ready for settlement',
  PAYMENT_METHOD_NOT_SUPPORTED: 'Payment method not supported',
  PIX_PAYMENT_NOT_FOUND: 'PIX payment not found or invalid payment type',
  TID_REQUIRED: 'Transaction ID (tid) is required for settlement',
  PIX_CREATION_FAILED: 'PIX payment creation failed - no payment data returned',
  PENDING: 'PIX payment is pending customer action',
} as const
