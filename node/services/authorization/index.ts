/* eslint-disable no-console */
/* eslint-disable no-fallthrough */
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
    const existingPayment = await this.deps.storageService.getStoredPayment(
      authorization.paymentId
    )

    if (existingPayment) {
      this.deps.logger.info('PIX: existing payment found', {
        paymentId: authorization.paymentId,
        braspagPaymentId: existingPayment.pixPaymentId,
        status: existingPayment.status,
      })

      this.deps.logger.info('PIX AUTHORIZATION: Existing payment', {
        existingPayment,
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

    this.deps.logger.info('PIX AUTHORIZATION: Extended authorization data', {
      extended,
    })

    const authData: PaymentAuthorizationData = {
      merchantSettings: extended.merchantSettings,
      paymentId: authorization.paymentId,
      paymentMethod: extended.paymentMethod,
      miniCart: {
        paymentMethod: extended.miniCart?.paymentMethod,
      },
    }

    this.deps.logger.info('PIX AUTHORIZATION: Auth data', { authData })

    const merchantSettings = this.deps.configService.getMerchantSettings(
      authData
    )

    this.deps.logger.info('PIX AUTHORIZATION: Merchant settings', {
      merchantSettings,
    })

    const braspagClient = this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )

    console.log('braspagClient', braspagClient)

    const notificationUrl = `https://marykay.myvtex.com/_v/notifications/braspag`

    let orderData: ExtractedOrderData | null = null

    if (extended.orderId) {
      const orderSequence = `${extended.orderId}-01`
      const hublyConfig = {
        apiKey: this.deps.context.settings?.hublyApiKey,
        organizationId: this.deps.context.settings?.hublyOrganizationId,
      }

      try {
        orderData = await this.deps.ordersClient.extractOrderData(
          orderSequence,
          hublyConfig
        )
      } catch (error) {
        this.deps.logger.error('Failed to extract order data', error)
        orderData = null
      }
    }

    this.deps.logger.info('PIX AUTHORIZATION: Order data', { orderData })

    const pixRequest = createBraspagPixSaleRequest(authorization, {
      merchantId: merchantSettings.merchantId,
      notificationUrl,
      monitfyConsultantId: orderData?.consultantId,
      braspagId: orderData?.braspagId,
      splitProfitPct: orderData?.splitProfitPct,
      splitDiscountPct: orderData?.splitDiscountPct,
      itemsSubtotal: orderData?.itemsSubtotal,
      discountsSubtotal: orderData?.discountsSubtotal,
      shippingValue: orderData?.shippingValue,
      couponDiscount: orderData?.couponDiscount,
      totalTaxes: orderData?.totalTaxes,
    })

    this.deps.logger.info(
      'PIX AUTHORIZATION: ===== PRE-PIX CREATION LOGS ====='
    )
    this.deps.logger.info('PIX AUTHORIZATION: Complete PIX Request Payload', {
      pixRequest: JSON.stringify(pixRequest, null, 2),
    })
    this.deps.logger.info('PIX AUTHORIZATION: Request Details', {
      merchantOrderId: pixRequest.MerchantOrderId,
      customer: pixRequest.Customer,
      paymentType: pixRequest.Payment?.Type,
      paymentAmount: pixRequest.Payment?.Amount,
      paymentProvider: pixRequest.Payment?.Provider,
      notificationUrl: pixRequest.Payment?.NotificationUrl,
      splitPayments: pixRequest.Payment?.SplitPayments,
      splitPaymentsCount: pixRequest.Payment?.SplitPayments?.length ?? 0,
    })
    this.deps.logger.info('PIX AUTHORIZATION: Split Payments Breakdown', {
      splitPayments: pixRequest.Payment?.SplitPayments?.map(sp => ({
        subordinateMerchantId: sp.SubordinateMerchantId,
        amount: sp.Amount,
        mdr: sp.Fares?.Mdr,
        fee: sp.Fares?.Fee,
      })),
    })
    this.deps.logger.info('PIX AUTHORIZATION: Configuration Used', {
      merchantId: merchantSettings.merchantId,
      notificationUrl,
      orderData,
    })
    this.deps.logger.info('PIX AUTHORIZATION: Authorization Data', {
      paymentId: authorization.paymentId,
      transactionId: authorization.transactionId,
      orderId: authorization.orderId,
      value: authorization.value,
      callbackUrl: authorization.callbackUrl,
    })

    const pixResponse = await braspagClient.createPixSale(pixRequest)

    this.deps.logger.info('PIX AUTHORIZATION: Pix response', { pixResponse })

    if (!pixResponse.Payment) {
      this.deps.logger.error(
        'PIX AUTHORIZATION: Pix response missing payment',
        { pixResponse }
      )
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    const { Payment: payment } = pixResponse

    if (payment.Status === BRASPAG_STATUS.ABORTED) {
      this.deps.logger.error('PIX AUTHORIZATION: Pix payment aborted', {
        payment,
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

    this.deps.logger.info('PIX AUTHORIZATION: Split summary', { splitSummary })

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

    this.deps.logger.info('PIX AUTHORIZATION: Payment data', { paymentData })

    await this.deps.storageService.savePaymentData(
      authorization.paymentId,
      paymentData
    )
    await this.deps.storageService.savePaymentData(
      payment.PaymentId,
      paymentData
    )
    this.deps.logger.info('Payment data stored with both keys', {
      vtexPaymentId: authorization.paymentId,
      braspagPaymentId: payment.PaymentId,
    })

    const paymentAppData = createPixPaymentAppData({
      qrCodeString: payment.QrCodeString,
      qrCodeBase64: payment.QrCodeBase64Image ?? payment.QrcodeBase64Image,
    })

    this.deps.logger.info('PIX AUTHORIZATION: Payment app data', {
      paymentAppData,
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
