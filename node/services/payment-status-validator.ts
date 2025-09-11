/**
 * Payment Status Validator Service
 * Handles payment status validation for different operations
 * Follows Single Responsibility Principle (SRP)
 */

/**
 * Braspag payment status codes
 */
export enum BraspagPaymentStatus {
  Pending = 1,
  Paid = 2,
  Denied = 3,
  Voided = 10,
  Aborted = 13,
  Scheduled = 20,
}

/**
 * Payment validation results
 */
export interface PaymentValidationResult {
  isValid: boolean
  reason?: string
  statusCode?: string
}

/**
 * Status validation for cancellation operations
 */
export interface CancellationValidator {
  canBeCancelled(status: number): PaymentValidationResult
}

/**
 * Status validation for settlement operations
 */
export interface SettlementValidator {
  canBeSettled(status: number): PaymentValidationResult
}

/**
 * Combined payment status validator
 */
export interface PaymentStatusValidator
  extends CancellationValidator,
    SettlementValidator {
  getStatusDescription(status: number): string
}

/**
 * Braspag-specific payment status validator implementation
 */
export class BraspagPaymentStatusValidator implements PaymentStatusValidator {
  /**
   * Check if payment can be cancelled based on status
   */
  public canBeCancelled(status: number): PaymentValidationResult {
    switch (status) {
      case BraspagPaymentStatus.Paid:
        return {
          isValid: false,
          reason: 'PIX payment cannot be cancelled - already paid',
          statusCode: 'PAID',
        }

      case BraspagPaymentStatus.Voided:
        return {
          isValid: true,
          reason: 'PIX payment already cancelled',
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Aborted:
        return {
          isValid: true,
          reason: 'PIX payment already cancelled',
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Pending:
        return {
          isValid: true,
          reason: 'PIX payment cancellation requested successfully',
          statusCode: '10', // Mark as voided
        }

      case BraspagPaymentStatus.Scheduled:
        return {
          isValid: true,
          reason: 'PIX payment cancellation requested successfully',
          statusCode: '10', // Mark as voided
        }

      case BraspagPaymentStatus.Denied:
        return {
          isValid: false,
          reason: `PIX payment cannot be cancelled. Status: ${status}`,
          statusCode: status.toString(),
        }

      default:
        return {
          isValid: false,
          reason: `PIX payment cannot be cancelled. Status: ${status}`,
          statusCode: status.toString(),
        }
    }
  }

  /**
   * Check if payment can be settled based on status
   */
  public canBeSettled(status: number): PaymentValidationResult {
    switch (status) {
      case BraspagPaymentStatus.Paid:
        return {
          isValid: true,
          reason: 'PIX payment successfully settled',
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Denied:
        return {
          isValid: false,
          reason: `PIX payment cannot be settled. Status: ${status}`,
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Voided:
        return {
          isValid: false,
          reason: `PIX payment cannot be settled. Status: ${status}`,
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Aborted:
        return {
          isValid: false,
          reason: `PIX payment cannot be settled. Status: ${status}`,
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Pending:
        return {
          isValid: false,
          reason: `PIX payment not ready for settlement. Status: ${status}`,
          statusCode: status.toString(),
        }

      case BraspagPaymentStatus.Scheduled:
        return {
          isValid: false,
          reason: `PIX payment not ready for settlement. Status: ${status}`,
          statusCode: status.toString(),
        }

      default:
        return {
          isValid: false,
          reason: `PIX payment not ready for settlement. Status: ${status}`,
          statusCode: status.toString(),
        }
    }
  }

  /**
   * Get human-readable description for status code
   */
  public getStatusDescription(status: number): string {
    switch (status) {
      case BraspagPaymentStatus.Pending:
        return 'Pending'

      case BraspagPaymentStatus.Paid:
        return 'Paid'

      case BraspagPaymentStatus.Denied:
        return 'Denied'

      case BraspagPaymentStatus.Voided:
        return 'Voided'

      case BraspagPaymentStatus.Aborted:
        return 'Aborted'

      case BraspagPaymentStatus.Scheduled:
        return 'Scheduled'

      default:
        return `Unknown (${status})`
    }
  }
}

/**
 * Factory for creating payment status validators
 */
export class PaymentStatusValidatorFactory {
  /**
   * Create Braspag payment status validator
   */
  public static createBraspagValidator(): BraspagPaymentStatusValidator {
    return new BraspagPaymentStatusValidator()
  }
}
