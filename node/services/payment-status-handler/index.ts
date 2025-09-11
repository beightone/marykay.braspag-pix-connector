import { PaymentStatusInfo } from './types'

export class PaymentStatusHandler {
  public static getStatusInfo(status: number): PaymentStatusInfo {
    return {
      status,
      canCancel: this.canCancel(status),
      canSettle: this.canSettle(status),
      isAlreadyPaid: status === 2,
      isAlreadyCancelled: status === 10 || status === 13,
      isPending: status === 1 || status === 20,
      statusDescription: this.getStatusDescription(status),
    }
  }

  private static canCancel(status: number): boolean {
    // Can cancel if pending (1) or scheduled (20)
    // Cannot cancel if paid (2), denied (3), voided (10), or aborted (13)
    return status === 1 || status === 20
  }

  private static canSettle(status: number): boolean {
    // Can only settle if paid (2)
    return status === 2
  }

  private static getStatusDescription(status: number): string {
    const statusMap: Record<number, string> = {
      1: 'Pending',
      2: 'Paid',
      3: 'Denied',
      10: 'Voided',
      13: 'Aborted',
      20: 'Scheduled',
    }

    return statusMap[status] ?? `Unknown (${status})`
  }
}
