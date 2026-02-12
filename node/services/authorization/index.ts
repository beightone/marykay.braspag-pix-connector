import {
  AuthorizationRequest,
  AuthorizationResponse,
  Authorizations,
} from '@vtex/payment-provider'

import {
  createBraspagPixSaleRequest,
  createPixPaymentAppData,
} from '../../adapters/braspag-pix-adapter'
import {
  RESPONSE_MESSAGES,
  PAYMENT_DELAYS,
  PAYMENT_TYPES,
  BRASPAG_STATUS,
  ERROR_CODES,
} from '../../constants/payment-constants'
import {
  PixAuthorizationService,
  PixAuthorizationServiceDependencies,
  PixAuthorizationServiceFactoryParams,
} from './types'
import { PaymentAuthorizationData } from '../payment-configuration/types'
import { ExtractedOrderData } from '../../clients/orders'
import { QueryPixStatusResponse } from '../../clients/braspag/types'

export class BraspagPixAuthorizationService implements PixAuthorizationService {
  constructor(private readonly deps: PixAuthorizationServiceDependencies) {}

  public async authorizePixPayment(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    const startTime = Date.now()

    const existingPayment = await this.deps.storageService.getStoredPayment(
      authorization.paymentId
    )

    if (existingPayment) {
      const elapsedMs = existingPayment.createdAt
        ? Date.now() - new Date(existingPayment.createdAt).getTime()
        : undefined

      this.deps.logger.info(
        '[PIX_AUTH] Retry detected - returning stored payment',
        {
          flow: 'authorization',
          action: 'retry_detected',
          paymentId: authorization.paymentId,
          orderId: authorization.orderId,
          pixPaymentId: existingPayment.pixPaymentId,
          vtexPaymentId: existingPayment.vtexPaymentId,
          currentStatus: existingPayment.status,
          buyerDocument: existingPayment.buyerDocument,
          buyerEmail: existingPayment.buyerEmail,
          buyerName: existingPayment.buyerName,
          createdAt: existingPayment.createdAt,
          elapsedMs,
        }
      )

      let resolvedStatus = existingPayment.status

      if (this.deps.queryClient) {
        try {
          const braspagResponse = await this.deps.queryClient.getTransactionByPaymentId<
            QueryPixStatusResponse
          >(existingPayment.pixPaymentId)

          const braspagCurrentStatus = braspagResponse?.Payment?.Status

          if (
            braspagCurrentStatus !== undefined &&
            braspagCurrentStatus !== resolvedStatus
          ) {
            this.deps.logger.info(
              '[PIX_AUTH] Braspag status differs from stored - updating',
              {
                flow: 'authorization',
                action: 'retry_status_reconciled',
                paymentId: authorization.paymentId,
                orderId: authorization.orderId,
                pixPaymentId: existingPayment.pixPaymentId,
                vtexPaymentId: existingPayment.vtexPaymentId,
                storedStatus: resolvedStatus,
                braspagStatus: braspagCurrentStatus,
                buyerDocument: existingPayment.buyerDocument,
                buyerEmail: existingPayment.buyerEmail,
                elapsedMs,
              }
            )

            resolvedStatus = braspagCurrentStatus

            // Update storage so future retries don't need to query again
            await this.deps.storageService.updatePaymentStatus(
              authorization.paymentId,
              braspagCurrentStatus
            )

            // Also update the Braspag PaymentId key
            await this.deps.storageService.updatePaymentStatus(
              existingPayment.pixPaymentId,
              braspagCurrentStatus
            )
          } else {
            this.deps.logger.info(
              '[PIX_AUTH] Braspag status confirmed - matches stored',
              {
                flow: 'authorization',
                action: 'retry_status_confirmed',
                paymentId: authorization.paymentId,
                orderId: authorization.orderId,
                pixPaymentId: existingPayment.pixPaymentId,
                braspagStatus: braspagCurrentStatus,
                storedStatus: resolvedStatus,
                buyerDocument: existingPayment.buyerDocument,
                elapsedMs,
              }
            )
          }
        } catch (queryError) {
          this.deps.logger.warn(
            '[PIX_AUTH] Failed to query Braspag on retry - using stored status',
            {
              flow: 'authorization',
              action: 'retry_braspag_query_failed',
              paymentId: authorization.paymentId,
              orderId: authorization.orderId,
              pixPaymentId: existingPayment.pixPaymentId,
              storedStatus: resolvedStatus,
              buyerDocument: existingPayment.buyerDocument,
              error:
                queryError instanceof Error
                  ? queryError.message
                  : String(queryError),
              elapsedMs,
            }
          )
        }
      }

      switch (resolvedStatus) {
        case BRASPAG_STATUS.PAID:
          this.deps.logger.info(
            '[PIX_AUTH] Retry resolved as PAID - approving',
            {
              flow: 'authorization',
              action: 'retry_approved',
              paymentId: authorization.paymentId,
              orderId: authorization.orderId,
              pixPaymentId: existingPayment.pixPaymentId,
              vtexPaymentId: existingPayment.vtexPaymentId,
              buyerDocument: existingPayment.buyerDocument,
              buyerEmail: existingPayment.buyerEmail,
              elapsedMs,
            }
          )

          return Authorizations.approve(authorization, {
            tid: existingPayment.pixPaymentId,
            authorizationId: existingPayment.pixPaymentId,
          })

        case BRASPAG_STATUS.VOIDED:
        case BRASPAG_STATUS.DENIED:
        case BRASPAG_STATUS.ABORTED:
          return Authorizations.deny(authorization, {
            tid: existingPayment.pixPaymentId,
            code: ERROR_CODES.DENIED,
            message: RESPONSE_MESSAGES.PIX_CANCELLED,
          })

        case BRASPAG_STATUS.NOT_FINISHED:
        case BRASPAG_STATUS.PENDING:
        case BRASPAG_STATUS.PENDING_AUTHORIZATION:
        default:
          return Authorizations.pending(authorization, {
            tid: existingPayment.pixPaymentId,
            delayToCancel: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
            delayToAutoSettle: PAYMENT_DELAYS.AUTO_SETTLE_DELAY,
            delayToAutoSettleAfterAntifraud:
              PAYMENT_DELAYS.AUTO_SETTLE_AFTER_ANTIFRAUD,
          })
      }
    }

    const extended = (authorization as unknown) as PaymentAuthorizationData & {
      merchantSettings?: Array<{
        name: string
        value: string
      }>
      paymentMethod?: string
      miniCart?: {
        paymentMethod?: string
        buyer?: {
          firstName?: string
          lastName?: string
          document?: string
          email?: string
          isCorporate?: boolean
          corporateDocument?: string
          corporateName?: string
        }
      }
      orderId?: string
    }

    // Extract buyer info for logging and storage
    const buyer = extended.miniCart?.buyer
    const buyerDocument = buyer?.isCorporate
      ? buyer?.corporateDocument?.replace(/[^\d]/g, '')
      : buyer?.document?.replace(/[^\d]/g, '')

    const buyerEmail = buyer?.email
    const buyerName = buyer?.isCorporate
      ? buyer?.corporateName
      : [buyer?.firstName, buyer?.lastName].filter(Boolean).join(' ') || undefined

    const authData: PaymentAuthorizationData = {
      merchantSettings: extended.merchantSettings,
      paymentId: authorization.paymentId,
      paymentMethod: extended.paymentMethod,
      miniCart: {
        paymentMethod: extended.miniCart?.paymentMethod,
      },
    }

    const merchantSettings = this.deps.configService.getMerchantSettings(
      authData
    )

    const braspagClient = this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )

    const notificationUrl = `https://marykay.myvtex.com/_v/notifications/braspag`

    let orderData: ExtractedOrderData | null = null
    let merchantOrderId: string | undefined

    if (extended.orderId) {
      const orderSequence = `${extended.orderId}-01`

      merchantOrderId = orderSequence
      const hublyConfig = {
        apiKey: this.deps.context.settings?.hublyApiKey,
        organizationId: this.deps.context.settings?.hublyOrganizationId,
      }

      try {
        orderData = await this.deps.ordersClient.extractOrderData(
          orderSequence,
          hublyConfig,
          this.deps.logger
        )

        this.deps.logger.info('[PIX_AUTH] Order data extracted', {
          flow: 'authorization',
          action: 'order_data_extracted',
          paymentId: authorization.paymentId,
          orderId: extended.orderId,
          buyerDocument,
          buyerEmail,
          buyerName,
          consultantId: orderData?.consultantId,
          braspagId: orderData?.braspagId,
          splitProfitPct: orderData?.splitProfitPct,
          itemsSubtotal: orderData?.itemsSubtotal,
          shippingValue: orderData?.shippingValue,
          couponDiscount: orderData?.couponDiscount,
          isFreeShipping:
            (orderData?.shippingValue ?? 0) === 0 &&
            (orderData?.couponDiscount ?? 0) > 0,
        })
      } catch (error) {
        this.deps.logger.warn('[PIX_AUTH] Order data extraction failed', {
          flow: 'authorization',
          action: 'order_data_extraction_failed',
          paymentId: authorization.paymentId,
          orderId: extended.orderId,
          buyerDocument,
          buyerEmail,
          error: error instanceof Error ? error.message : String(error),
        })
        orderData = null
      }
    }

    const isFreeShippingCoupon =
      (orderData?.shippingValue ?? 0) === 0 &&
      (orderData?.couponDiscount ?? 0) > 0

    const pixRequest = createBraspagPixSaleRequest(
      authorization,
      {
        merchantId: merchantSettings.merchantId,
        notificationUrl,
        monitfyConsultantId: orderData?.consultantId,
        braspagId: orderData?.braspagId,
        mdr: orderData?.splitProfitPct,
        orderId: merchantOrderId ?? authorization.orderId,
        splitProfitPct: orderData?.splitProfitPct,
        splitDiscountPct: orderData?.splitDiscountPct,
        itemsSubtotal: orderData?.itemsSubtotal,
        discountsSubtotal: orderData?.discountsSubtotal,
        shippingValue: orderData?.shippingValue,
        couponDiscount: orderData?.couponDiscount,
        totalTaxes: orderData?.totalTaxes,
        isFreeShippingCoupon,
      },
      this.deps.logger
    )

    this.deps.logger.info('[PIX_AUTH] Sending request to Braspag', {
      flow: 'authorization',
      action: 'braspag_request_sent',
      paymentId: authorization.paymentId,
      orderId: authorization.orderId,
      transactionId: authorization.transactionId,
      buyerDocument,
      buyerEmail,
      buyerName,
      valueBRL: authorization.value,
      amountCents: pixRequest.Payment?.Amount,
      merchantOrderId: pixRequest.MerchantOrderId,
      hasSplit: !!pixRequest.Payment?.SplitPayments?.length,
      splitCount: pixRequest.Payment?.SplitPayments?.length ?? 0,
      splits: pixRequest.Payment?.SplitPayments?.map(split => ({
        merchantId: split.SubordinateMerchantId,
        amount: split.Amount,
        mdr: split.Fares?.Mdr,
        fee: split.Fares?.Fee,
      })),
    })

    const pixResponse = await braspagClient.createPixSale(pixRequest)

    if (!pixResponse.Payment) {
      this.deps.logger.error(
        '[PIX_AUTH] Braspag returned empty payment response',
        {
          flow: 'authorization',
          action: 'braspag_empty_response',
          paymentId: authorization.paymentId,
          orderId: authorization.orderId,
          buyerDocument,
          buyerEmail,
          durationMs: Date.now() - startTime,
        }
      )
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    const { Payment: payment } = pixResponse

    if (payment.Status === BRASPAG_STATUS.ABORTED) {
      const paymentAny = payment as any

      this.deps.logger.error('[PIX_AUTH] Payment aborted by Braspag', {
        flow: 'authorization',
        action: 'payment_aborted',
        paymentId: authorization.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: authorization.orderId,
        buyerDocument,
        buyerEmail,
        buyerName,
        valueBRL: authorization.value,
        amountCents: pixRequest.Payment?.Amount,
        returnCode: paymentAny.ReturnCode,
        returnMessage: paymentAny.ReturnMessage,
        providerReturnCode: paymentAny.ProviderReturnCode,
        providerReturnMessage: paymentAny.ProviderReturnMessage,
        reasonCode: paymentAny.ReasonCode,
        reasonMessage: paymentAny.ReasonMessage,
        consultantId: orderData?.consultantId,
        braspagId: orderData?.braspagId,
        durationMs: Date.now() - startTime,
      })

      return Authorizations.deny(authorization, {
        tid: payment.PaymentId,
        code: ERROR_CODES.DENIED,
        message: 'PIX payment aborted - consultant account not approved',
      })
    }

    const splitSummary =
      pixRequest.Payment.SplitPayments?.map(sp => ({
        subordinateMerchantId: sp.SubordinateMerchantId,
        amount: sp.Amount,
        mdr: sp.Fares?.Mdr,
        fee: sp.Fares?.Fee,
      })) ?? []

    const paymentData = {
      pixPaymentId: payment.PaymentId,
      braspagTransactionId: payment.Tid,
      merchantOrderId: pixRequest.MerchantOrderId,
      status: payment.Status,
      type: PAYMENT_TYPES.PIX,
      orderId: authorization.orderId,
      vtexPaymentId: authorization.paymentId,
      callbackUrl: authorization.callbackUrl,
      amount: pixRequest.Payment?.Amount,
      buyerDocument,
      buyerEmail,
      buyerName,
      ...(splitSummary.length > 0 && { splitPayments: splitSummary }),
    }

    await this.deps.storageService.savePaymentData(
      authorization.paymentId,
      paymentData
    )
    await this.deps.storageService.savePaymentData(
      payment.PaymentId,
      paymentData
    )

    this.deps.logger.info('[PIX_AUTH] Authorization completed successfully', {
      flow: 'authorization',
      action: 'authorization_completed',
      paymentId: authorization.paymentId,
      pixPaymentId: payment.PaymentId,
      tid: payment.Tid,
      orderId: authorization.orderId,
      vtexPaymentId: authorization.paymentId,
      merchantOrderId: pixRequest.MerchantOrderId,
      buyerDocument,
      buyerEmail,
      buyerName,
      valueBRL: authorization.value,
      amountCents: pixRequest.Payment?.Amount,
      braspagStatus: payment.Status,
      hasQrCode: !!payment.QrCodeString,
      hasSplit: splitSummary.length > 0,
      splitCount: splitSummary.length,
      pixExpirationMs: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
      durationMs: Date.now() - startTime,
    })

    const paymentAppData = createPixPaymentAppData({
      qrCodeString: payment.QrCodeString,
      qrCodeBase64: payment.QrCodeBase64Image ?? payment.QrcodeBase64Image,
    })

    return Authorizations.pending(authorization, {
      tid: payment.PaymentId,
      code: payment.Status?.toString() ?? '1',
      message: RESPONSE_MESSAGES.PIX_CREATED,
      paymentAppData,
      delayToCancel: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
      delayToAutoSettle: PAYMENT_DELAYS.AUTO_SETTLE_DELAY,
      delayToAutoSettleAfterAntifraud:
        PAYMENT_DELAYS.AUTO_SETTLE_AFTER_ANTIFRAUD,
    })
  }
}

export class PixAuthorizationServiceFactory {
  public static create(
    params: PixAuthorizationServiceFactoryParams
  ): PixAuthorizationService {
    return new BraspagPixAuthorizationService({
      configService: params.configService,
      storageService: params.storageService,
      clientFactory: params.clientFactory,
      queryClient: params.queryClient,
      context: params.context,
      logger: params.logger,
      ordersClient: params.ordersClient,
    })
  }
}
