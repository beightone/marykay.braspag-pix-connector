export interface PaymentStatusInfo {
  status: number
  canCancel: boolean
  canSettle: boolean
  isAlreadyPaid: boolean
  isAlreadyCancelled: boolean
  isPending: boolean
  statusDescription: string
}
