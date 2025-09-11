export interface PaymentValidationResult {
  isValid: boolean
  reason?: string
  statusCode?: string
}

export interface CancellationValidator {
  canBeCancelled(status: number): PaymentValidationResult
}

export interface SettlementValidator {
  canBeSettled(status: number): PaymentValidationResult
}

export interface PaymentStatusValidator
  extends CancellationValidator,
    SettlementValidator {
  getStatusDescription(status: number): string
}
