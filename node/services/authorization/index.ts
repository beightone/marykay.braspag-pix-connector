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
} from '../../constants/payment-constants'
import {
  PixAuthorizationService,
  PixAuthorizationServiceDependencies,
  ExtendedAuthorizationRequest,
  BraspagPayment,
  PixAuthorizationServiceFactoryParams,
} from './types'
import { customData as mockCustomData } from '../../__mock__/customData'

export class BraspagPixAuthorizationService implements PixAuthorizationService {
  constructor(private readonly deps: PixAuthorizationServiceDependencies) {}

  public async authorizePixPayment(
    authorization: AuthorizationRequest
  ): Promise<AuthorizationResponse> {
    const merchantSettings = this.getMerchantSettings(authorization)

    const braspagClient = this.deps.clientFactory.createClient(
      this.deps.context,
      merchantSettings
    )

    const notificationUrl = this.deps.configService.buildNotificationUrl(
      this.deps.context
    )

    // TODO USAR CUSTOMDATA DE PRODUÇÃO
    const mockCustomDataTyped = mockCustomData as any
    const splitApp = mockCustomDataTyped.customApps?.find(
      (app: any) => app.id === 'splitsimulation'
    )

    const retailersApp = mockCustomDataTyped.customApps?.find(
      (app: any) => app.id === 'retailers'
    )

    const splitProfitPct = splitApp?.fields?.splitProfitPct
      ? parseFloat(splitApp.fields.splitProfitPct)
      : undefined

    const splitDiscountPct = splitApp?.fields?.splitDiscountPct
      ? parseFloat(splitApp.fields.splitDiscountPct)
      : undefined

    const consultantData = JSON.parse(retailersApp.fields.consultant)

    const pixRequest = createBraspagPixSaleRequest(authorization, {
      merchantId: merchantSettings.merchantId,
      notificationUrl,
      monitfyConsultantId: consultantData.monitfyConsultantId,
      splitProfitPct,
      splitDiscountPct,
    })

    this.deps.logger.info('Creating PIX sale', {
      merchantOrderId: pixRequest.MerchantOrderId,
      amount: pixRequest.Payment.Amount,
      splitPayments: pixRequest.Payment.SplitPayments?.length ?? 0,
      monitfyConsultantId: consultantData.monitfyConsultantId,
      splitProfitPct,
    })

    const pixResponse = await braspagClient.createPixSale(pixRequest)

    if (!pixResponse.Payment) {
      throw new Error(RESPONSE_MESSAGES.PIX_CREATION_FAILED)
    }

    const { Payment: payment } = pixResponse

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

  private getMerchantSettings(authorization: AuthorizationRequest) {
    const extendedAuth = authorization as ExtendedAuthorizationRequest

    const merchantSettingsArray = Object.entries(
      extendedAuth.merchantSettings ?? {}
    ).map(([name, value]) => ({
      name,
      value: String(value),
    }))

    const authData = {
      merchantSettings: merchantSettingsArray,
      paymentId: authorization.paymentId,
      paymentMethod: extendedAuth.paymentMethod,
      miniCart: {
        paymentMethod: extendedAuth.miniCart?.paymentMethod,
      },
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
    })
  }
}
