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
    const startTime = Date.now()

    this.deps.logger.info('VOUCHER_REFUND: ===== START PROCESS =====', {
      orderId,
      paymentId,
      userId,
      refundValue,
      timestamp: new Date().toISOString(),
    })

    this.deps.logger.info('VOUCHER_REFUND: Step 1/5 - Fetching payment from storage', {
      paymentId,
    })

    const storedPayment = await this.deps.storageService.getStoredPayment(paymentId)
    
    if (!storedPayment) {
      this.deps.logger.error('VOUCHER_REFUND: Payment not found in storage', {
        paymentId,
        duration: Date.now() - startTime,
      })
      throw new Error(`Payment ${paymentId} not found`)
    }

    this.deps.logger.info('VOUCHER_REFUND: Payment found in storage', {
      paymentId,
      type: storedPayment.type,
      status: storedPayment.status,
      amount: storedPayment.amount,
      merchantOrderId: storedPayment.merchantOrderId,
      pixPaymentId: storedPayment.pixPaymentId,
      hasCallbackUrl: !!storedPayment.callbackUrl,
    })

    if (storedPayment.type !== 'pix') {
      this.deps.logger.error('VOUCHER_REFUND: Invalid payment type', {
        paymentId,
        expectedType: 'pix',
        actualType: storedPayment.type,
        duration: Date.now() - startTime,
      })
      throw new Error(`Payment ${paymentId} is not a PIX payment`)
    }

    const payment: StoredPaymentData = {
      paymentId: storedPayment.vtexPaymentId || paymentId,
      orderId: storedPayment.merchantOrderId,
      amount: storedPayment.amount ?? 0,
      status: storedPayment.status ?? 0,
      braspagPaymentId: storedPayment.pixPaymentId,
      callbackUrl: storedPayment.callbackUrl,
    }

    this.deps.logger.info('VOUCHER_REFUND: Payment data mapped', {
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      braspagPaymentId: payment.braspagPaymentId,
    })

    this.deps.logger.info('VOUCHER_REFUND: Step 2/5 - Validating payment status', {
      currentStatus: payment.status,
      isRefunded: payment.status === 11,
      isCancelled: payment.status === 10,
    })

    if (payment.status === 11 || payment.status === 10) {
      this.deps.logger.warn('VOUCHER_REFUND: Payment already refunded/cancelled', {
        paymentId,
        currentStatus: payment.status,
        statusName: payment.status === 11 ? 'Refunded' : 'Cancelled',
        duration: Date.now() - startTime,
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

    this.deps.logger.info('VOUCHER_REFUND: Step 3/5 - Validating refund amount', {
      refundValue,
      paymentAmount: payment.amount,
      isValid: refundValue <= payment.amount,
    })

    if (refundValue > payment.amount) {
      this.deps.logger.error('VOUCHER_REFUND: Refund value exceeds payment amount', {
        paymentId,
        refundValue,
        paymentAmount: payment.amount,
        difference: refundValue - payment.amount,
        duration: Date.now() - startTime,
      })
      throw new Error(
        `Refund value (${refundValue}) exceeds payment amount (${payment.amount})`
      )
    }

    try {
      this.deps.logger.info('VOUCHER_REFUND: Step 4/5 - Creating giftcard via giftcards app', {
        userId,
        refundValue,
        orderId,
        giftcardsEndpoint: '/_v/refund',
      })

      const giftcardStartTime = Date.now()
      const giftcardResult = await this.deps.giftcardsClient.createRefundVoucher({
        userId,
        refundValue,
        orderId,
      })
      const giftcardDuration = Date.now() - giftcardStartTime

      this.deps.logger.info('VOUCHER_REFUND: Giftcard created successfully', {
        giftCardId: giftcardResult.giftCardId,
        redemptionCode: giftcardResult.redemptionCode,
        duration: giftcardDuration,
        userId,
        refundValue,
        orderId,
      })

      this.deps.logger.info('VOUCHER_REFUND: Step 5/5 - Cancelling order in VTEX OMS', {
        orderId,
        reason: 'Reembolso via voucher - Gift card criado',
        omsEndpoint: `/api/oms/pvt/orders/${orderId}/cancel`,
      })

      try {
        const cancelStartTime = Date.now()
        await this.deps.ordersClient.cancelOrderInVtex(
          orderId,
          'Reembolso via voucher - Gift card criado'
        )
        const cancelDuration = Date.now() - cancelStartTime

        this.deps.logger.info('VOUCHER_REFUND: Order cancelled successfully in VTEX', {
          orderId,
          duration: cancelDuration,
        })
      } catch (cancelError) {
        const cancelErrorMsg = cancelError instanceof Error ? cancelError.message : String(cancelError)
        const cancelErrorStack = cancelError instanceof Error ? cancelError.stack : undefined

        this.deps.logger.warn('VOUCHER_REFUND: Failed to cancel order in VTEX (non-blocking)', {
          orderId,
          error: cancelErrorMsg,
          stack: cancelErrorStack,
          note: 'Giftcard was created successfully, but order cancellation failed',
        })
      }

      this.deps.logger.info('VOUCHER_REFUND: Updating payment status to 11 (Refunded)', {
        paymentId,
        oldStatus: payment.status,
        newStatus: 11,
      })

      await this.deps.storageService.updatePaymentStatus(paymentId, 11)

      this.deps.logger.info('VOUCHER_REFUND: Payment status updated successfully', {
        paymentId,
        status: 11,
      })

      const totalDuration = Date.now() - startTime

      const result: VoucherRefundResponse = {
        success: true,
        giftCardId: giftcardResult.giftCardId,
        redemptionCode: giftcardResult.redemptionCode,
        refundValue,
        orderId,
        message: 'Voucher refund processed successfully',
      }

      this.deps.logger.info('VOUCHER_REFUND: ===== END PROCESS (SUCCESS) =====', {
        result,
        totalDuration,
        giftCardId: result.giftCardId,
        redemptionCode: result.redemptionCode,
        orderId,
        paymentId,
      })

      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined

      this.deps.logger.error('VOUCHER_REFUND: Error during process', {
        error: errorMsg,
        stack: errorStack,
        step: 'Creating giftcard or updating status',
        userId,
        orderId,
        paymentId,
        refundValue,
        duration: Date.now() - startTime,
      })

      this.deps.logger.info('VOUCHER_REFUND: ===== END PROCESS (ERROR) =====', {
        error: errorMsg,
        duration: Date.now() - startTime,
      })

      throw error
    }
  }
}

export class VoucherRefundServiceFactory {
  static create(deps: VoucherRefundServiceDeps): VoucherRefundService {
    return new VoucherRefundServiceImpl(deps)
  }
}

