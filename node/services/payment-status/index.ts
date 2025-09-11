import { PaymentStatusValidator, PaymentValidationResult } from './types'

export enum BraspagPaymentStatus {
  Pending = 1,
  Paid = 2,
  Denied = 3,
  Voided = 10,
  Aborted = 13,
  Scheduled = 20,
}
export class BraspagPaymentStatusValidator implements PaymentStatusValidator {
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
          statusCode: '10',
        }

      case BraspagPaymentStatus.Scheduled:
        return {
          isValid: true,
          reason: 'PIX payment cancellation requested successfully',
          statusCode: '10',
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

export class PaymentStatusValidatorFactory {
  public static createBraspagValidator(): BraspagPaymentStatusValidator {
    return new BraspagPaymentStatusValidator()
  }
}
