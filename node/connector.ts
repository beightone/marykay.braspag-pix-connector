/* eslint-disable no-console */
import {
  AuthorizationRequest,
  AuthorizationResponse,
  CancellationRequest,
  CancellationResponse,
  Cancellations,
  PaymentProvider,
  RefundRequest,
  RefundResponse,
  Refunds,
  SettlementRequest,
  SettlementResponse,
  Settlements,
  Authorizations,
} from '@vtex/payment-provider'
import { VBase } from '@vtex/api'

import { randomString } from './utils'
import { executeAuthorization } from './flow'
import { BraspagClient } from './clients/braspag'
import {
  createBraspagPixSaleRequest,
  createPixPaymentAppData,
} from './adapters/braspag-pix-adapter'

const authorizationsBucket = 'authorizations'
const persistAuthorizationResponse = async (
  vbase: VBase,
  resp: AuthorizationResponse
) => vbase.saveJSON(authorizationsBucket, resp.paymentId, resp)

const getPersistedAuthorizationResponse = async (
  vbase: VBase,
  req: AuthorizationRequest
) =>
  vbase.getJSON<AuthorizationResponse | undefined>(
    authorizationsBucket,
    req.paymentId,
    true
  )

export default class TestSuiteApprover extends PaymentProvider {
  // This class needs modifications to pass the test suit.
  // Refer to https://help.vtex.com/en/tutorial/payment-provider-protocol#4-testing
  // in order to learn about the protocol and make the according changes.

  private async saveAndRetry(
    req: AuthorizationRequest,
    resp: AuthorizationResponse
  ) {
    await persistAuthorizationResponse(this.context.clients.vbase, resp)

    console.log('CONNECTOR: Attempting callback to Test Suite...')
    try {
      this.callback(req, resp)

      console.log('CONNECTOR: Callback successful')
    } catch (error) {
      console.log(
        'CONNECTOR: Callback failed (TLS error expected in test environment):',
        error?.message
      )
      // TLS errors são esperados no ambiente de teste - continuamos normalmente
    }
  }

  public async authorize(
    authorization: AuthorizationRequest & {
      paymentMethod?: string
      splits?: Array<{
        merchantId: string
        amount: number
        commission?: {
          fee?: number
          gateway?: number
        }
      }>
    }
  ): Promise<AuthorizationResponse> {
    console.info('CONNECTOR: Authorize called with', {
      authorization,
      isTestSuite: this.isTestSuite,
    })

    if (this.isTestSuite) {
      const persistedResponse = await getPersistedAuthorizationResponse(
        this.context.clients.vbase,
        authorization
      )

      if (persistedResponse !== undefined && persistedResponse !== null) {
        return persistedResponse
      }

      console.log('CONNECTOR: No persisted response found, executing flow')

      return executeAuthorization(authorization, response =>
        this.saveAndRetry(authorization, response)
      )
    }

    // Real PIX implementation for production
    try {
      // Get merchant settings from authorization
      const auth = authorization as {
        merchantSettings?: Array<{ name: string; value: string }>
        paymentMethod?: string
        paymentId: string
        miniCart?: { paymentMethod?: string }
      }

      const merchantSettings = auth.merchantSettings ?? []

      const getMerchantSetting = (name: string) =>
        merchantSettings.find(
          (ms: { name: string; value: string }) => ms.name === name
        )?.value

      const merchantId =
        getMerchantSetting('merchantId') ??
        'E28449FA-1268-42BF-B4D3-313BF447285E'

      const clientSecret =
        getMerchantSetting('clientSecret') ??
        'q2R/Ya3zlXFWQ9Ar8FylNbbIyhFJAKvw+eEknMsKTD8='

      const merchantKey =
        getMerchantSetting('merchantKey') ??
        'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP'

      console.log('CONNECTOR: Retrieved merchant settings', {
        merchantId: !!merchantId,
        clientSecret: !!clientSecret,
        merchantKey: !!merchantKey,
      })

      // Create Braspag client context with credentials
      const ioContext = {
        ...this.context.vtex,
        settings: {
          merchantId,
          clientSecret,
          merchantKey,
        },
      }

      const braspagClient = new BraspagClient(ioContext)

      // Check if this is a PIX payment
      if (
        auth.paymentMethod === 'Pix' ||
        auth.miniCart?.paymentMethod === 'Pix'
      ) {
        // Build notification URL
        const { workspace, account } = this.context.vtex
        const notificationUrl = `https://${workspace}--${account}.myvtex.com/_v/api/braspag-pix-connector/notifications`

        // Create the Braspag PIX sale request
        const pixRequest = createBraspagPixSaleRequest(authorization, {
          merchantId,
          notificationUrl,
        })

        // Log PIX sale creation

        console.info('BRASPAG: Creating PIX sale', {
          merchantOrderId: pixRequest.MerchantOrderId,
          amount: pixRequest.Payment.Amount,
          splits: pixRequest.Payment.SplitPayments?.length ?? 0,
        })

        // Call Braspag API to create PIX payment
        const pixResponse = await braspagClient.createPixSale(pixRequest)

        if (!pixResponse.Payment) {
          throw new Error(
            'PIX payment creation failed - no payment data returned'
          )
        }

        const { Payment: payment } = pixResponse

        // Prepare payment app data for QR code
        const paymentAppData = createPixPaymentAppData(
          payment.QrCodeString,
          payment.QrCodeBase64Image ?? payment.QrcodeBase64Image
        )

        // Store payment information for later retrieval
        await this.context.clients.vbase.saveJSON(
          'braspag-payments',
          auth.paymentId,
          {
            pixPaymentId: payment.PaymentId,
            braspagTransactionId: payment.Tid,
            merchantOrderId: pixRequest.MerchantOrderId,
            status: payment.Status,
            type: 'pix',
          }
        )

        console.info('BRASPAG: PIX sale created successfully', {
          paymentId: payment.PaymentId,
          status: payment.Status,
          hasQrCode: !!paymentAppData,
        })

        // Return pending response with QR code data
        return Authorizations.pending(authorization, {
          tid: payment.PaymentId,
          code: payment.Status?.toString() ?? '1',
          message: 'PIX payment created successfully',
          paymentAppData,
          delayToCancel: 15 * 60 * 1000, // 15 minutes in milliseconds
          delayToAutoSettle: 2 * 60 * 1000, // 2 minutes
          delayToAutoSettleAfterAntifraud: 2 * 60 * 1000,
        })
      }

      throw new Error('Payment method not supported')
    } catch (error) {
      console.error('BRASPAG: PIX authorization failed', error)

      return Authorizations.deny(authorization, {
        code: 'ERROR',
        message: `PIX authorization failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public async cancel(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse> {
    if (this.isTestSuite) {
      return Cancellations.approve(cancellation, {
        cancellationId: randomString(),
      })
    }

    // Real PIX cancellation implementation
    try {
      // Retrieve stored payment information
      const storedPayment = await this.context.clients.vbase.getJSON<{
        pixPaymentId: string
        braspagTransactionId?: string
        merchantOrderId: string
        status?: number
        type: string
      }>('braspag-payments', cancellation.paymentId, true)

      if (!storedPayment || storedPayment.type !== 'pix') {
        throw new Error('PIX payment not found or invalid payment type')
      }

      // Create Braspag client for querying and potentially voiding payment
      const ioContext = {
        ...this.context.vtex,
        settings: {
          // These would need to be retrieved from stored settings or environment
          merchantId: process.env.BRASPAG_MERCHANT_ID ?? '',
          clientSecret: process.env.BRASPAG_CLIENT_SECRET ?? '',
          merchantKey: process.env.BRASPAG_MERCHANT_KEY ?? '',
        },
      }

      const braspagClient = new BraspagClient(ioContext)

      // Query the current payment status from Braspag
      const paymentStatus = await braspagClient.queryPixPaymentStatus(
        storedPayment.pixPaymentId
      )

      const { Payment: payment } = paymentStatus

      // Check if payment can be cancelled
      // Status codes: 1-Pending, 2-Paid, 3-Denied, 10-Voided, 13-Aborted, 20-Scheduled
      if (payment.Status === 2) {
        // Payment is already paid, cannot be cancelled
        return Cancellations.deny(cancellation, {
          code: 'PAID',
          message: 'PIX payment cannot be cancelled - already paid',
        })
      }

      if (payment.Status === 10 || payment.Status === 13) {
        // Payment is already voided or aborted
        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId,
          code: payment.Status.toString(),
          message: 'PIX payment already cancelled',
        })
      }

      if (payment.Status === 1 || payment.Status === 20) {
        // Payment is pending or scheduled, can be cancelled
        // For PIX payments, we typically cannot void them through API
        // The cancellation is usually automatic when the payment expires
        // We'll mark it as successfully cancelled in our system

        // Update the stored payment status
        await this.context.clients.vbase.saveJSON(
          'braspag-payments',
          cancellation.paymentId,
          {
            ...storedPayment,
            status: 10, // Mark as voided
            cancelledAt: new Date().toISOString(),
          }
        )

        return Cancellations.approve(cancellation, {
          cancellationId: payment.PaymentId,
          code: '10',
          message: 'PIX payment cancellation requested successfully',
        })
      }

      // Other status - deny cancellation
      return Cancellations.deny(cancellation, {
        code: payment.Status?.toString() ?? 'UNKNOWN',
        message: `PIX payment cannot be cancelled. Status: ${payment.Status}`,
      })
    } catch (error) {
      console.error('BRASPAG: PIX cancellation failed', error)

      return Cancellations.deny(cancellation, {
        code: 'ERROR',
        message: `PIX cancellation failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public async refund(refund: RefundRequest): Promise<RefundResponse> {
    if (this.isTestSuite) {
      return Refunds.deny(refund)
    }

    throw new Error('Not implemented')
  }

  public async settle(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    if (this.isTestSuite) {
      return Settlements.deny(settlement)
    }

    // Real PIX settlement implementation
    try {
      const { tid } = settlement

      if (!tid) {
        throw new Error('Transaction ID (tid) is required for settlement')
      }

      // Extract payment ID from tid (should be the Braspag payment ID)
      const paymentId = tid

      // Retrieve stored payment information
      const storedPayment = await this.context.clients.vbase.getJSON<{
        pixPaymentId: string
        braspagTransactionId?: string
        merchantOrderId: string
        status?: number
        type: string
      }>('braspag-payments', settlement.paymentId, true)

      if (!storedPayment || storedPayment.type !== 'pix') {
        throw new Error('PIX payment not found or invalid payment type')
      }

      // Create Braspag client for querying payment status
      // We need to get merchant settings again since this is a separate request
      // This would typically come from the original transaction or be stored
      const ioContext = {
        ...this.context.vtex,
        settings: {
          // These would need to be retrieved from stored settings or environment
          merchantId: process.env.BRASPAG_MERCHANT_ID ?? '',
          clientSecret: process.env.BRASPAG_CLIENT_SECRET ?? '',
          merchantKey: process.env.BRASPAG_MERCHANT_KEY ?? '',
        },
      }

      const braspagClient = new BraspagClient(ioContext)

      // Query the current payment status from Braspag
      const paymentStatus = await braspagClient.queryPixPaymentStatus(paymentId)

      const { Payment: payment } = paymentStatus

      // Check if payment is settled/paid
      // Status codes: 1-Pending, 2-Paid, 3-Denied, 10-Voided, 13-Aborted, 20-Scheduled
      if (payment.Status === 2) {
        // Payment is paid/settled
        return Settlements.approve(settlement, {
          settleId: payment.PaymentId,
          code: payment.Status.toString(),
          message: 'PIX payment successfully settled',
        })
      }

      if (
        payment.Status === 3 ||
        payment.Status === 10 ||
        payment.Status === 13
      ) {
        // Payment is denied, voided, or aborted
        return Settlements.deny(settlement, {
          code: payment.Status?.toString() ?? 'DENIED',
          message: `PIX payment cannot be settled. Status: ${payment.Status}`,
        })
      }

      // Payment is still pending or other status
      return Settlements.deny(settlement, {
        code: payment.Status?.toString() ?? 'PENDING',
        message: `PIX payment not ready for settlement. Status: ${payment.Status}`,
      })
    } catch (error) {
      console.error('BRASPAG: PIX settlement failed', error)

      return Settlements.deny(settlement, {
        code: 'ERROR',
        message: `PIX settlement failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      })
    }
  }

  public inbound: undefined
}
