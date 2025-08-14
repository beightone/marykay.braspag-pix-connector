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

import { CreatePixSaleRequest } from './clients/braspag/types'
import { randomString } from './utils'
import { executeAuthorization } from './flow'
import { Clients } from './clients'

const authorizationsBucket = 'authorizations'
const pixAuthDataBucket = 'pix-auth-data'

type PixAuthData = {
  orderId: string
  buyerId?: string
  braspagPaymentId: string
}
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

const savePixAuthData = async (
  vbase: VBase,
  paymentId: string,
  data: PixAuthData
) => vbase.saveJSON(pixAuthDataBucket, paymentId, data)

const getPixAuthData = async (vbase: VBase, paymentId: string) =>
  vbase.getJSON<PixAuthData | undefined>(pixAuthDataBucket, paymentId, true)

export default class BraspagConnector extends PaymentProvider<Clients> {
  // This class needs modifications to pass the test suit.
  // Refer to https://help.vtex.com/en/tutorial/payment-provider-protocol#4-testing
  // in order to learn about the protocol and make the according changes.

  private async saveAndRetry(
    req: AuthorizationRequest,
    resp: AuthorizationResponse
  ) {
    await persistAuthorizationResponse(this.context.clients.vbase, resp)
    this.callback(req, resp)
  }

  public async authorize(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    if (this.isTestSuite) {
      const persistedResponse = await getPersistedAuthorizationResponse(
        this.context.clients.vbase,
        authorization
      )

      if (persistedResponse !== undefined && persistedResponse !== null) {
        return persistedResponse
      }

      return executeAuthorization(authorization, response =>
        this.saveAndRetry(authorization, response)
      )
    }

    const amount = authorization.value
    const merchantOrderId = authorization.paymentId

    const shippingValue = authorization.miniCart?.shippingValue ?? 0
    const recipients = authorization.recipients ?? []

    const consultantId = authorization.merchantSettings?.find(
      f => f.name === 'monitfyConsultantId'
    )?.value as string | undefined

    const orderFormId = authorization.merchantSettings?.find(
      f => f.name === 'orderFormId'
    )?.value as string | undefined

    let adjustedMasterCommissionPct: number | undefined

    if (consultantId && orderFormId) {
      try {
        const simulation = await this.context.clients.storeServices.simulateSplit(
          {
            monitfyConsultantId: consultantId,
            orderFormId,
          }
        )

        adjustedMasterCommissionPct = simulation.splitProfitPct
        this.context.logger?.info('SPLIT_SIMULATION_SUCCESS', {
          consultantId,
          orderFormId,
          splitProfitPct: simulation.splitProfitPct,
        })
      } catch (error) {
        this.context.logger?.error('SPLIT_SIMULATION_ERROR', {
          consultantId,
          orderFormId,
          error: error instanceof Error ? error.message : error,
        })
      }
    }

    const sellerRecipients = recipients.filter(r => r.role === 'seller')
    const marketplaceRecipients = recipients.filter(
      r => r.role === 'marketplace'
    )

    const sellerItemAmount = sellerRecipients.reduce(
      (acc, r) => acc + (r.amount ?? 0),
      0
    )

    const marketplaceTotal = marketplaceRecipients.reduce(
      (acc, r) => acc + (r.amount ?? 0),
      0
    )

    const marketplaceItemAmount = Math.max(marketplaceTotal - shippingValue, 0)
    const itemsTotal = sellerItemAmount + marketplaceItemAmount

    const primarySellerId = sellerRecipients[0]?.id
    const marketplaceId = marketplaceRecipients[0]?.id
    const fallbackMdr =
      itemsTotal > 0
        ? Math.round((marketplaceItemAmount / itemsTotal) * 100)
        : 0

    const mdrPercent =
      typeof adjustedMasterCommissionPct === 'number'
        ? Math.round(adjustedMasterCommissionPct)
        : fallbackMdr

    const splitPayments = [] as NonNullable<
      CreatePixSaleRequest['Payment']['SplitPayments']
    >

    if (primarySellerId && itemsTotal > 0) {
      splitPayments.push({
        SubordinateMerchantId: primarySellerId,
        Amount: itemsTotal,
        Fares: { Mdr: mdrPercent },
      })
    }

    if (shippingValue > 0 && marketplaceId) {
      splitPayments.push({
        SubordinateMerchantId: marketplaceId,
        Amount: shippingValue,
        Fares: { Mdr: 0, Fee: 0 },
      })
    }

    const payload: CreatePixSaleRequest = {
      MerchantOrderId: merchantOrderId,
      Customer: authorization.miniCart?.buyer?.document
        ? {
            Identity: authorization.miniCart.buyer.document,
            IdentityType: 'CPF',
            Name: authorization.miniCart.buyer.firstName
              ? `${authorization.miniCart.buyer.firstName} ${authorization
                  .miniCart.buyer.lastName || ''}`.trim()
              : undefined,
          }
        : undefined,
      Payment: {
        Type: 'Pix',
        Amount: amount,
        Provider: 'Braspag',
        SplitPayments: splitPayments.length > 0 ? splitPayments : undefined,
      },
    }

    this.context.logger?.info('CREATING_PIX_SALE', {
      merchantOrderId,
      amount,
      splitPaymentsCount: splitPayments.length,
    })

    const sale = await this.context.clients.braspag.createPixSale(payload)

    if (!sale || !sale.Payment || !sale.Payment.PaymentId) {
      this.context.logger?.error('PIX_SALE_CREATION_FAILED', {
        merchantOrderId,
        saleResponse: sale,
      })

      return Authorizations.deny(authorization, { tid: merchantOrderId })
    }

    const qrString = sale.Payment.QrCodeString

    if (!qrString) {
      this.context.logger?.error('PIX_QR_STRING_MISSING', {
        merchantOrderId,
        paymentId: sale.Payment.PaymentId,
      })

      return Authorizations.deny(authorization, { tid: merchantOrderId })
    }

    const pending = Authorizations.pendingBankInvoice(authorization, {
      tid: sale.Payment.PaymentId,
      delayToCancel: 120000,
      paymentUrl: qrString,
    })

    await savePixAuthData(this.context.clients.vbase, merchantOrderId, {
      orderId: authorization.orderId,
      buyerId: authorization.miniCart?.buyer?.id,
      braspagPaymentId: sale.Payment.PaymentId,
    })

    this.context.logger?.info('PIX_AUTHORIZATION_SUCCESS', {
      merchantOrderId,
      paymentId: sale.Payment.PaymentId,
      orderId: authorization.orderId,
      amount,
    })

    return pending
  }

  public async cancel(
    cancellation: CancellationRequest
  ): Promise<CancellationResponse> {
    if (this.isTestSuite) {
      return Cancellations.approve(cancellation, {
        cancellationId: randomString(),
      })
    }

    throw new Error('Not implemented')
  }

  public async refund(refund: RefundRequest): Promise<RefundResponse> {
    if (this.isTestSuite) {
      return Refunds.deny(refund)
    }

    const { paymentId } = refund
    const mapping = await getPixAuthData(this.context.clients.vbase, paymentId)
    const buyerId = mapping?.buyerId
    const refundValue = refund.value
    const orderId = mapping?.orderId ?? paymentId

    if (!buyerId || !refundValue) {
      this.context.logger?.warn('REFUND_DENIED_MISSING_DATA', {
        paymentId,
        buyerId,
        refundValue,
        orderId,
      })

      return Refunds.deny(refund)
    }

    try {
      const gift = await this.context.clients.giftcardsIntegration.refund({
        userId: buyerId,
        refundValue,
        orderId,
      })

      this.context.logger?.info('REFUND_SUCCESS', {
        paymentId,
        refundValue,
        giftCardId: gift.giftCardId,
        orderId,
      })

      return Refunds.approve(refund, { refundId: gift.giftCardId })
    } catch (error) {
      this.context.logger?.error('REFUND_FAILED', {
        paymentId,
        refundValue,
        orderId,
        error: error instanceof Error ? error.message : error,
      })

      return Refunds.deny(refund)
    }
  }

  public async settle(
    settlement: SettlementRequest
  ): Promise<SettlementResponse> {
    if (this.isTestSuite) {
      return Settlements.deny(settlement)
    }

    return Settlements.deny(settlement)
  }

  public async inbound(inbound: {
    paymentId: string
    requestData: { body: string }
  }) {
    try {
      const parsed = JSON.parse(inbound.requestData?.body ?? '{}')

      this.context.logger?.info('BRASPAG_NOTIFICATION_RECEIVED', {
        paymentId: inbound.paymentId,
        notificationData: parsed,
      })

      await this.context.clients.storeServices.forwardBraspagNotification(
        parsed
      )

      this.context.logger?.info('BRASPAG_NOTIFICATION_FORWARDED', {
        paymentId: inbound.paymentId,
      })
    } catch (error) {
      this.context.logger?.error('BRASPAG_NOTIFICATION_ERROR', {
        paymentId: inbound.paymentId,
        error: error instanceof Error ? error.message : error,
        requestBody: inbound.requestData?.body,
      })
    }

    return {
      paymentId: inbound.paymentId,
      code: 'ok',
      message: 'received',
      requestId: randomString(),
      responseData: {
        statusCode: 200,
        contentType: 'application/json',
        content: JSON.stringify({ ok: true }),
      },
    }
  }
}
