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
      this.deps.logger.info('[PIX_AUTH] Existing payment found', {
        flow: 'authorization',
        action: 'existing_payment',
        paymentId: authorization.paymentId,
        pixPaymentId: existingPayment.pixPaymentId,
        status: existingPayment.status,
        orderId: authorization.orderId,
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
        this.deps.logger.info('[PIX_AUTH] Extracting order data', {
          flow: 'authorization',
          action: 'extract_order_data_start',
          orderId: extended.orderId,
          orderSequence,
        })

        orderData = await this.deps.ordersClient.extractOrderData(
          orderSequence,
          hublyConfig,
          this.deps.logger
        )

        const isFreeShipping =
          (orderData?.shippingValue ?? 0) === 0 &&
          (orderData?.couponDiscount ?? 0) > 0

        console.log('orderData gotardo', orderData)
        this.deps.logger.info('[PIX_AUTH] Order data extracted', {
          flow: 'authorization',
          action: 'order_data_extracted',
          orderId: extended.orderId,
          consultantId: orderData?.consultantId,
          braspagId: orderData?.braspagId,
          splitProfitPct: orderData?.splitProfitPct,
          splitDiscountPct: orderData?.splitDiscountPct,
          itemsSubtotal: orderData?.itemsSubtotal,
          discountsSubtotal: orderData?.discountsSubtotal,
          shippingValue: orderData?.shippingValue,
          couponDiscount: orderData?.couponDiscount,
          totalTaxes: orderData?.totalTaxes,
          isFreeShipping,
        })
      } catch (error) {
        this.deps.logger.warn('[PIX_AUTH] Order data extraction failed', {
          flow: 'authorization',
          action: 'order_data_extraction',
          orderId: extended.orderId,
          error: error instanceof Error ? error.message : String(error),
        })
        orderData = null
      }
    }

    const isFreeShippingCoupon =
      (orderData?.shippingValue ?? 0) === 0 &&
      (orderData?.couponDiscount ?? 0) > 0

    this.deps.logger.info(
      '[PIX_AUTH] Building PIX request with split calculation',
      {
        flow: 'authorization',
        action: 'build_pix_request',
        paymentId: authorization.paymentId,
        orderId: authorization.orderId,
        value: authorization.value,
        merchantId: merchantSettings.merchantId,
        orderData: {
          consultantId: orderData?.consultantId,
          braspagId: orderData?.braspagId,
          splitProfitPct: orderData?.splitProfitPct,
          splitDiscountPct: orderData?.splitDiscountPct,
          itemsSubtotal: orderData?.itemsSubtotal,
          discountsSubtotal: orderData?.discountsSubtotal,
          shippingValue: orderData?.shippingValue,
          couponDiscount: orderData?.couponDiscount,
          totalTaxes: orderData?.totalTaxes,
          isFreeShippingCoupon,
        },
      }
    )

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

    this.deps.logger.info('[PIX_AUTH] PIX request built', {
      flow: 'authorization',
      action: 'pix_request_built',
      paymentId: authorization.paymentId,
      transactionId: authorization.transactionId,
      orderId: authorization.orderId,
      value: authorization.value,
      merchantOrderId: pixRequest.MerchantOrderId,
      paymentAmount: pixRequest.Payment?.Amount,
      hasSplit: !!pixRequest.Payment?.SplitPayments?.length,
      splitCount: pixRequest.Payment?.SplitPayments?.length ?? 0,
      splits: pixRequest.Payment?.SplitPayments?.map(split => ({
        subordinateMerchantId: split.SubordinateMerchantId,
        amount: split.Amount,
        mdr: split.Fares?.Mdr,
        fee: split.Fares?.Fee,
      })),
      consultantId: orderData?.consultantId,
      braspagId: orderData?.braspagId,
    })

    this.deps.logger.info('[PIX_AUTH] Sending request to Braspag', {
      flow: 'authorization',
      action: 'send_braspag_request',
      paymentId: authorization.paymentId,
      merchantOrderId: pixRequest.MerchantOrderId,
      requestPayload: JSON.stringify(pixRequest),
    })

    const pixResponse = await braspagClient.createPixSale(pixRequest)

    this.deps.logger.info('[PIX_AUTH] Braspag response received', {
      flow: 'authorization',
      action: 'braspag_response_received',
      paymentId: authorization.paymentId,
      orderId: authorization.orderId,
      braspagPaymentId: pixResponse.Payment?.PaymentId,
      status: pixResponse.Payment?.Status,
      hasQrCode: !!pixResponse.Payment?.QrCodeString,
      responsePayload: JSON.stringify(pixResponse),
    })

    if (!pixResponse.Payment) {
      this.deps.logger.error('[PIX_AUTH] Payment creation failed', {
        flow: 'authorization',
        action: 'create_pix_failed',
        paymentId: authorization.paymentId,
        orderId: authorization.orderId,
      })
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    const { Payment: payment } = pixResponse

    if (payment.Status === BRASPAG_STATUS.ABORTED) {
      /* eslint-disable no-console, @typescript-eslint/no-explicit-any */
      const paymentAny = payment as any

      console.log('========== PAYMENT ABORTED - START ==========')
      console.log('Full payment object:')
      console.log(JSON.stringify(payment, null, 2))
      console.log('\nError details:')
      console.log('ReturnCode:', paymentAny.ReturnCode)
      console.log('ReturnMessage:', paymentAny.ReturnMessage)
      console.log('ProviderReturnCode:', paymentAny.ProviderReturnCode)
      console.log('ProviderReturnMessage:', paymentAny.ProviderReturnMessage)
      console.log('ReasonCode:', paymentAny.ReasonCode)
      console.log('ReasonMessage:', paymentAny.ReasonMessage)
      console.log('\nFull response:')
      console.log(JSON.stringify(pixResponse, null, 2))
      console.log('========== PAYMENT ABORTED - END ==========')
      /* eslint-enable no-console, @typescript-eslint/no-explicit-any */

      this.deps.logger.error('[PIX_AUTH] Payment aborted', {
        flow: 'authorization',
        action: 'payment_aborted',
        paymentId: authorization.paymentId,
        pixPaymentId: payment.PaymentId,
        orderId: authorization.orderId,
        status: payment.Status,
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

    this.deps.logger.info('[PIX_AUTH] Payment created successfully', {
      flow: 'authorization',
      action: 'payment_created',
      paymentId: authorization.paymentId,
      pixPaymentId: payment.PaymentId,
      transactionId: payment.Tid,
      orderId: authorization.orderId,
      value: authorization.value,
      status: payment.Status,
      hasSplit: splitSummary.length > 0,
      splitCount: splitSummary.length,
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
