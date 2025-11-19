import {
  VoucherRefundService,
  VoucherRefundServiceDeps,
  VoucherRefundRequest,
  VoucherRefundResponse,
  StoredPaymentData,
} from './types'

export class VoucherRefundServiceImpl implements VoucherRefundService {
  constructor(private deps: VoucherRefundServiceDeps) {}

  public async processVoucherRefund(
    request: VoucherRefundRequest
  ): Promise<VoucherRefundResponse> {
    const { orderId, paymentId, userId, refundValue } = request

    this.deps.logger.info('[VOUCHER] Starting voucher refund process', {
      flow: 'voucher_refund',
      action: 'refund_started',
      orderId,
      paymentId,
      userId,
      refundValue,
    })

    const storedPayment = await this.deps.storageService.getStoredPayment(
      paymentId
    )

    if (!storedPayment) {
      this.deps.logger.error('[VOUCHER] Payment not found in storage', {
        flow: 'voucher_refund',
        action: 'payment_not_found',
        paymentId,
      })
      throw new Error(`Payment ${paymentId} not found`)
    }

    if (storedPayment.type !== 'pix') {
      this.deps.logger.error('[VOUCHER] Invalid payment type', {
        flow: 'voucher_refund',
        action: 'invalid_payment_type',
        paymentId,
        expectedType: 'pix',
        actualType: storedPayment.type,
      })
      throw new Error(`Payment ${paymentId} is not a PIX payment`)
    }

    const payment: StoredPaymentData = {
      paymentId: storedPayment.vtexPaymentId ?? paymentId,
      orderId: storedPayment.merchantOrderId,
      amount: storedPayment.amount ?? 0,
      status: storedPayment.status ?? 0,
      braspagPaymentId: storedPayment.pixPaymentId,
      callbackUrl: storedPayment.callbackUrl,
    }

    if (payment.status === 11 || payment.status === 10) {
      this.deps.logger.warn('[VOUCHER] Payment already refunded/cancelled', {
        flow: 'voucher_refund',
        action: 'payment_already_refunded',
        paymentId,
        status: payment.status,
      })

      return {
        success: false,
        giftCardId: '',
        redemptionCode: '',
        refundValue: 0,
        orderId,
        message: 'Payment already refunded or cancelled',
      }
    }

    if (refundValue > payment.amount) {
      this.deps.logger.error('[VOUCHER] Refund value exceeds payment amount', {
        flow: 'voucher_refund',
        action: 'invalid_refund_amount',
        paymentId,
        refundValue,
        paymentAmount: payment.amount,
      })
      throw new Error(
        `Refund value (${refundValue}) exceeds payment amount (${payment.amount})`
      )
    }

    try {
      const giftcardResult = await this.deps.giftcardsClient.createRefundVoucher(
        {
          userId,
          refundValue,
          orderId,
        }
      )

      this.deps.logger.info('[VOUCHER] Giftcard created successfully', {
        flow: 'voucher_refund',
        action: 'giftcard_created',
        orderId,
        paymentId,
        giftCardId: giftcardResult.giftCardId,
        redemptionCode: giftcardResult.redemptionCode,
        refundValue,
      })

      try {
        await this.deps.ordersClient.cancelOrderInVtex(
          orderId,
          'Reembolso via voucher - Gift card criado'
        )

        this.deps.logger.info('[VOUCHER] Order cancelled successfully', {
          flow: 'voucher_refund',
          action: 'order_cancelled',
          orderId,
        })
      } catch (cancelError) {
        this.deps.logger.warn(
          '[VOUCHER] Order cancellation failed (non-blocking)',
          {
            flow: 'voucher_refund',
            action: 'order_cancellation_failed',
            orderId,
            error:
              cancelError instanceof Error
                ? cancelError.message
                : String(cancelError),
          }
        )
      }

      await this.deps.storageService.updatePaymentStatus(paymentId, 11)

      const result: VoucherRefundResponse = {
        success: true,
        giftCardId: giftcardResult.giftCardId,
        redemptionCode: giftcardResult.redemptionCode,
        refundValue,
        orderId,
        message: 'Voucher refund processed successfully',
      }

      this.deps.logger.info('[VOUCHER] Voucher refund completed successfully', {
        flow: 'voucher_refund',
        action: 'refund_completed',
        orderId,
        paymentId,
        giftCardId: result.giftCardId,
        redemptionCode: result.redemptionCode,
        refundValue,
      })

      return result
    } catch (error) {
      this.deps.logger.error('[VOUCHER] Voucher refund failed', {
        flow: 'voucher_refund',
        action: 'refund_failed',
        orderId,
        paymentId,
        userId,
        refundValue,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }
}

export class VoucherRefundServiceFactory {
  public static create(deps: VoucherRefundServiceDeps): VoucherRefundService {
    return new VoucherRefundServiceImpl(deps)
  }
}
