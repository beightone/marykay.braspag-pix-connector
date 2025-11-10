export type Order = {
  orderId: string
  clientProfileData: {
    firstName: string
    lastName: string
    email: string
  }
  items: OrderItem[]
  status: string
  statusDescription: string
  customData: unknown
  totals: Total[]
  value: number
  paymentData: PaymentData
  packageAttachment: {
    packages: Array<{
      invoiceKey: string
    }>
  }
}

export type OrderItem = {
  id: string
  name: string
  ean: string
  quantity: number
  listPrice: number
  price: number
  manualPrice?: number
}

export type Total = {
  id: string
  name: string
  value: number
}

export type PaymentData = {
  transactions: Transaction[]
}

export type Transaction = {
  transactionId: string
  payments: Payment[]
}

export type Payment = {
  id: string
  tid: string
  paymentSystemName: string
  installments: number
  group: string
}
