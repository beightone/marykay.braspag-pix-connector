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
      this.deps.logger.info('PIX.AUTH.RETRY_DETECTED', {
        flow: 'authorization',
        action: 'retry_detected',
        paymentId: authorization.paymentId,
        orderId: authorization.orderId,
        pixPaymentId: existingPayment.pixPaymentId,
        currentStatus: existingPayment.status,
        createdAt: existingPayment.createdAt,
        elapsedMs: existingPayment.createdAt
          ? Date.now() - new Date(existingPayment.createdAt).getTime()
          : undefined,
      })

      switch (existingPayment.status) {
        case BRASPAG_STATUS.PAID:
          return Authorizations.approve(authorization, {
            tid: existingPayment.pixPaymentId,
            authorizationId: existingPayment.pixPaymentId,
          })

        case BRASPAG_STATUS.NOT_FINISHED:
          return Authorizations.pending(authorization, {
            tid: existingPayment.pixPaymentId,
            delayToCancel: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
            delayToAutoSettle: PAYMENT_DELAYS.AUTO_SETTLE_DELAY,
            delayToAutoSettleAfterAntifraud:
              PAYMENT_DELAYS.AUTO_SETTLE_AFTER_ANTIFRAUD,
          })

        case BRASPAG_STATUS.VOIDED:
          return Authorizations.deny(authorization, {
            tid: existingPayment.pixPaymentId,
            code: ERROR_CODES.DENIED,
            message: RESPONSE_MESSAGES.PIX_CANCELLED,
          })

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
      miniCart?: { paymentMethod?: string }
      orderId?: string
    }

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

        this.deps.logger.info('PIX.AUTH.ORDER_DATA_EXTRACTED', {
          flow: 'authorization',
          action: 'order_data_extracted',
          paymentId: authorization.paymentId,
          orderId: extended.orderId,
          consultantId: orderData?.consultantId,
          braspagId: orderData?.braspagId,
          splitProfitPct: orderData?.splitProfitPct,
          itemsSubtotal: orderData?.itemsSubtotal,
          shippingValue: orderData?.shippingValue,
          couponDiscount: orderData?.couponDiscount,
          isFreeShipping: (orderData?.shippingValue ?? 0) === 0 && (orderData?.couponDiscount ?? 0) > 0,
        })
      } catch (error) {
        this.deps.logger.warn('PIX.AUTH.ORDER_DATA_FAILED', {
          flow: 'authorization',
          action: 'order_data_extraction_failed',
          paymentId: authorization.paymentId,
          orderId: extended.orderId,
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

    this.deps.logger.info('PIX.AUTH.BRASPAG_REQUEST', {
      flow: 'authorization',
      action: 'braspag_request_sent',
      paymentId: authorization.paymentId,
      orderId: authorization.orderId,
      transactionId: authorization.transactionId,
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
      this.deps.logger.error('PIX.AUTH.NO_PAYMENT_RESPONSE', {
        flow: 'authorization',
        action: 'braspag_empty_response',
        paymentId: authorization.paymentId,
        orderId: authorization.orderId,
        durationMs: Date.now() - startTime,
      })
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    const { Payment: payment } = pixResponse

    if (payment.Status === BRASPAG_STATUS.ABORTED) {
      const paymentAny = payment as any

      this.deps.logger.error('PIX.AUTH.ABORTED', {
        flow: 'authorization',
        action: 'payment_aborted',
        paymentId: authorization.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: authorization.orderId,
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

    this.deps.logger.info('PIX.AUTH.COMPLETED', {
      flow: 'authorization',
      action: 'authorization_completed',
      paymentId: authorization.paymentId,
      pixPaymentId: payment.PaymentId,
      tid: payment.Tid,
      orderId: authorization.orderId,
      merchantOrderId: pixRequest.MerchantOrderId,
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
      context: params.context,
      logger: params.logger,
      ordersClient: params.ordersClient,
    })
  }
}
