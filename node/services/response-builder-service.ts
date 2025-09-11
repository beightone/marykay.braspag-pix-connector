import {
  AuthorizationRequest,
  AuthorizationResponse,
  Authorizations,
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  SettlementRequest,
  SettlementResponse,
  Settlements,
} from '@vtex/payment-provider'

import { PAYMENT_DELAYS, RESPONSE_MESSAGES } from '../constants/payment-constants'

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

interface PendingAuthorizationOptions {
  tid: string
  code: string
  paymentAppData?: any
  message?: string
}

interface ApprovedCancellationOptions {
  cancellationId: string
  code?: string
  message?: string
}

interface DeniedCancellationOptions {
  code: string
  message: string
}

interface ApprovedSettlementOptions {
  settleId: string
  code?: string
  message?: string
}

interface DeniedSettlementOptions {
  code: string
  message: string
}

export class StandardResponseBuilderService implements ResponseBuilderService {
  public buildPendingAuthorization(
    request: AuthorizationRequest,
    options: PendingAuthorizationOptions
  ): AuthorizationResponse {
    return Authorizations.pending(request, {
      tid: options.tid,
      code: options.code,
      message: options.message ?? RESPONSE_MESSAGES.PIX_CREATED,
      paymentAppData: options.paymentAppData,
      delayToCancel: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
      delayToAutoSettle: PAYMENT_DELAYS.AUTO_SETTLE_DELAY,
      delayToAutoSettleAfterAntifraud: PAYMENT_DELAYS.AUTO_SETTLE_AFTER_ANTIFRAUD,
    })
  }

  public buildApprovedCancellation(
    request: CancellationRequest,
    options: ApprovedCancellationOptions
  ): CancellationResponse {
    return Cancellations.approve(request, {
      cancellationId: options.cancellationId,
      code: options.code,
      message: options.message,
    })
  }

  public buildDeniedCancellation(
    request: CancellationRequest,
    options: DeniedCancellationOptions
  ): CancellationResponse {
    return Cancellations.deny(request, {
      code: options.code,
      message: options.message,
    })
  }

  public buildApprovedSettlement(
    request: SettlementRequest,
    options: ApprovedSettlementOptions
  ): SettlementResponse {
    return Settlements.approve(request, {
      settleId: options.settleId,
      code: options.code,
      message: options.message,
    })
  }

  public buildDeniedSettlement(
    request: SettlementRequest,
    options: DeniedSettlementOptions
  ): SettlementResponse {
    return Settlements.deny(request, {
      code: options.code,
      message: options.message,
    })
  }
}

export class ResponseBuilderServiceFactory {
  public static create(): ResponseBuilderService {
    return new StandardResponseBuilderService()
  }
}
