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
  PIX_CANCEL_TIMEOUT: 15 * 60 * 1000, // 15 minutes
  AUTO_SETTLE_DELAY: 2 * 60 * 1000, // 2 minutes
  AUTO_SETTLE_AFTER_ANTIFRAUD: 2 * 60 * 1000, // 2 minutes
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

// Default merchant credentials (fallback)
export const DEFAULT_MERCHANT_CONFIG = {
  MERCHANT_ID: '85c49198-837a-423c-89d0-9087b5d16d49',
  CLIENT_SECRET: 'Dbmrh40sM/ne/3fVmLVkicGdndGY5zFgUNnMJ9seBMM=',
  MERCHANT_KEY: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',
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
} as const
