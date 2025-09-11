import {
  AuthorizationRequest,
  AuthorizationResponse,
  CancellationRequest,
  CancellationResponse,
  SettlementRequest,
  SettlementResponse,
} from '@vtex/payment-provider'

export interface PendingAuthorizationOptions {
  tid: string
  code: string
  paymentAppData?: any
  message?: string
}

export interface ApprovedCancellationOptions {
  cancellationId: string
  code?: string
  message?: string
}

export interface DeniedCancellationOptions {
  code: string
  message: string
}

export interface ApprovedSettlementOptions {
  settleId: string
  code?: string
  message?: string
}

export interface DeniedSettlementOptions {
  code: string
  message: string
}

export interface ResponseBuilderService {
  buildPendingAuthorization(
    request: AuthorizationRequest,
    options: PendingAuthorizationOptions
  ): AuthorizationResponse

  buildApprovedCancellation(
    request: CancellationRequest,
    options: ApprovedCancellationOptions
  ): CancellationResponse

  buildDeniedCancellation(
    request: CancellationRequest,
    options: DeniedCancellationOptions
  ): CancellationResponse

  buildApprovedSettlement(
    request: SettlementRequest,
    options: ApprovedSettlementOptions
  ): SettlementResponse

  buildDeniedSettlement(
    request: SettlementRequest,
    options: DeniedSettlementOptions
  ): SettlementResponse
}
