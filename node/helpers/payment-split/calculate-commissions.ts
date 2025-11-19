/* eslint-disable max-params */
import { DatadogCompatibleLogger } from '../../tools/datadog/logger.types'

interface OrderValues {
  totalItemsAmount: number
  totalDiscountAmount: number
  couponDiscountAmount?: number
}

interface Commissions {
  master: number
  subordinate: number
}

export function calculateCommissions(
  orderValues: OrderValues,
  rawCommissions: Commissions,
  sharedCoupon: boolean,
  isFreeShippingCoupon = false,
  logger?: DatadogCompatibleLogger
) {
  logger?.info('COMMISSION_CALC: Starting calculation', {
    orderValues,
    rawCommissions,
    sharedCoupon,
    isFreeShippingCoupon,
  })

  if (!orderValues.couponDiscountAmount || isFreeShippingCoupon) {
    logger?.info('COMMISSION_CALC: No coupon adjustment needed', {
      reason: !orderValues.couponDiscountAmount
        ? 'no_coupon'
        : 'free_shipping_coupon',
    })

    return rawCommissions
  }

  const baseAmount = orderValues.totalItemsAmount
  const couponAmount = Math.abs(orderValues.couponDiscountAmount)
  const totalDiscountAmount = Math.abs(orderValues.totalDiscountAmount)

  const result = sharedCoupon
    ? calculateSharedCoupon(
        baseAmount,
        couponAmount,
        totalDiscountAmount,
        rawCommissions
      )
    : calculateConsultantCoupon(
        baseAmount,
        couponAmount,
        totalDiscountAmount,
        rawCommissions
      )

  logger?.info('COMMISSION_CALC: Calculation completed', {
    adjustedCommissions: result,
    couponType: sharedCoupon ? 'shared' : 'consultant',
  })

  return result
}

function calculateSharedCoupon(
  baseAmount: number,
  couponAmount: number,
  totalDiscountAmount: number,
  rawCommissions: Commissions
): Commissions {
  const customerPaid = baseAmount - totalDiscountAmount
  const consultantCouponPortion = couponAmount / 2

  const brandDiscountAmount = totalDiscountAmount - couponAmount
  const consultantBaseAmount = baseAmount - brandDiscountAmount
  const consultantGross = calculateGrossCommission(
    consultantBaseAmount,
    rawCommissions.subordinate
  )

  const consultantNet = consultantGross - consultantCouponPortion

  const maryKayNet = customerPaid - consultantNet

  return {
    master: (maryKayNet / customerPaid) * 100,
    subordinate: (consultantNet / customerPaid) * 100,
  }
}

function calculateConsultantCoupon(
  baseAmount: number,
  couponAmount: number,
  totalDiscountAmount: number,
  rawCommissions: Commissions
): Commissions {
  const customerPaid = baseAmount - totalDiscountAmount
  const brandDiscountAmount = totalDiscountAmount - couponAmount
  const consultantBaseAmount = baseAmount - brandDiscountAmount
  const consultantGross = calculateGrossCommission(
    consultantBaseAmount,
    rawCommissions.subordinate
  )

  const consultantNet = consultantGross - couponAmount
  const masterNet = customerPaid - consultantNet

  return {
    master: (masterNet / customerPaid) * 100,
    subordinate: (consultantNet / customerPaid) * 100,
  }
}

function calculateGrossCommission(
  baseAmount: number,
  percentage: number
): number {
  return (percentage / 100) * baseAmount
}
