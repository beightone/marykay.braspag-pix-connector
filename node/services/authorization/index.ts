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
  BraspagPayment,
  PixAuthorizationServiceFactoryParams,
} from './types'
import { PaymentAuthorizationData } from '../payment-configuration/types'

export class BraspagPixAuthorizationService implements PixAuthorizationService {
  constructor(private readonly deps: PixAuthorizationServiceDependencies) {}

  public async authorizePixPayment(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    const merchantSettings = this.getMerchantSettingsFromAuthorization(
      authorization
    )

    const braspagClient = this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )

    const notificationUrl = this.deps.configService.buildNotificationUrl(
      this.deps.context
    )

    const orderData = await this.getOrderData(authorization)

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

    const pixResponse = await braspagClient.createPixSale(pixRequest)

    if (!pixResponse.Payment) {
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    console.dir(
      { where: 'authorization.authorizePixPayment', pixResponse },
      { depth: null, colors: true }
    )

    const { Payment: payment } = pixResponse

    if (payment.Status === BRASPAG_STATUS.ABORTED) {
      this.deps.logger.warn('PIX payment aborted by Braspag', {
        paymentId: payment.PaymentId,
        status: payment.Status,
        splitPayments: pixRequest.Payment.SplitPayments?.length ?? 0,
      })

      return Authorizations.deny(authorization, {
        tid: payment.PaymentId,
        code: ERROR_CODES.DENIED,
        message: 'PIX payment aborted - consultant account not approved',
      })
    }

    await this.storePaymentData(
      authorization.paymentId,
      payment,
      pixRequest.MerchantOrderId
    )

    const paymentAppData = createPixPaymentAppData({
      qrCodeString: payment.QrCodeString,
      qrCodeBase64: payment.QrCodeBase64Image ?? payment.QrcodeBase64Image,
    })

    this.deps.logger.info('PIX sale created successfully', {
      paymentId: payment.PaymentId,
      status: payment.Status,
      splitPayments: pixRequest.Payment.SplitPayments?.length ?? 0,
      pixResponse,
      paymentAppData,
    })

    const authResponse = Authorizations.pending(authorization, {
      tid: payment.PaymentId,
      code: payment.Status?.toString() ?? '1',
      message: RESPONSE_MESSAGES.PIX_CREATED,
      paymentAppData,
      delayToCancel: PAYMENT_DELAYS.PIX_CANCEL_TIMEOUT,
      delayToAutoSettle: PAYMENT_DELAYS.AUTO_SETTLE_DELAY,
      delayToAutoSettleAfterAntifraud:
        PAYMENT_DELAYS.AUTO_SETTLE_AFTER_ANTIFRAUD,
    })

    return authResponse
  }

  private async getOrderData(authorization: AuthorizationRequest) {
    const extended = (authorization as unknown) as { orderId?: string }

    if (!extended.orderId) {
      return null
    }

    const orderSequence = `${extended.orderId}-01`

    const hublyConfig = {
      apiKey: this.deps.context.settings?.hublyApiKey,
      organizationId: this.deps.context.settings?.hublyOrganizationId,
    }

    try {
      return await this.deps.ordersClient.extractOrderData(
        orderSequence,
        hublyConfig
      )
    } catch (error) {
      this.deps.logger.error('Failed to extract order data', error)

      return null
    }
  }

  private getMerchantSettingsFromAuthorization(
    authorization: AuthorizationRequest
  ) {
    const extended = (authorization as unknown) as PaymentAuthorizationData & {
      merchantSettings?: Array<{ name: string; value: string }>
      paymentMethod?: string
      miniCart?: { paymentMethod?: string }
    }

    const authData: PaymentAuthorizationData = {
      merchantSettings: extended.merchantSettings,
      paymentId: authorization.paymentId,
      paymentMethod: extended.paymentMethod,
      miniCart: { paymentMethod: extended.miniCart?.paymentMethod },
    }

    return this.deps.configService.getMerchantSettings(authData)
  }

  private async storePaymentData(
    paymentId: string,
    payment: BraspagPayment,
    merchantOrderId: string
  ) {
    const paymentData = {
      pixPaymentId: payment.PaymentId,
      braspagTransactionId: payment.Tid,
      merchantOrderId,
      status: payment.Status,
      type: PAYMENT_TYPES.PIX,
    }

    await this.deps.storageService.savePaymentData(paymentId, paymentData)
    await this.deps.storageService.savePaymentData(
      payment.PaymentId,
      paymentData
    )
    this.deps.logger.info('Payment data stored with both keys', {
      vtexPaymentId: paymentId,
      braspagPaymentId: payment.PaymentId,
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
