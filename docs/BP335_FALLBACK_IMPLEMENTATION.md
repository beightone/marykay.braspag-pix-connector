# Implementação: Fallback para Voucher quando BP335 (Split Transactional Error)

## Visão Geral

Implementação de fallback automático para reembolso via voucher quando o estorno direto na Braspag falha com erro **BP335** (Split Transactional Error), conforme documentação oficial: [API Error Codes - Cielo/Braspag](https://docs.cielo.com.br/gateway-en/reference/api-error-codes)

## Problema: Erro BP335

### Contexto

Quando um pagamento PIX com Split já foi liquidado ou há inconsistência nos valores do split, a Braspag retorna erro **BP335** ao tentar fazer o estorno:

```json
{
  "Status": 2,
  "ReasonCode": 37,
  "ReasonMessage": "SplitTransactionalError",
  "ProviderReturnCode": "BP335",
  "ProviderReturnMessage": "Cancel aborted by Split transactional error",
  "VoidSplitErrors": [
    {
      "Code": 326,
      "Message": "Requested Revert amount for Merchant Id d23429c6-4cdc-484e-9dfa-a8ecd5ea539c is higher than avaliable amount (748)"
    }
  ]
}
```

### Solução Implementada

1. **Detecção do Erro BP335**: O sistema detecta automaticamente quando o estorno falha com BP335
2. **Resposta com Flag**: Retorna `Cancellations.deny()` com flag `requiresVoucherRefund: true`
3. **Frontend pode chamar**: A rota `/refund/voucher` para processar o reembolso via gift card

## Fluxo Implementado

### Cenário 1: Reembolso Direto via Voucher

```
Cliente solicita cancelamento
  ↓
POST /_v/pix-connector/refund/voucher
  ↓
Valida pagamento
  ↓
Cria gift card via marykay.giftcards-integration
  ↓
Cancela pedido na VTEX (sem chamar Braspag)
  ↓
Atualiza status pagamento → 11 (Refunded)
  ↓
Retorna giftCardId + redemptionCode
```

### Cenário 2: Tentativa de Estorno Braspag → Fallback BP335

```
Cliente solicita cancelamento
  ↓
VTEX chama cancel() do connector
  ↓
Connector tenta void na Braspag
  ↓
Braspag retorna BP335 (SplitTransactionalError)
  ↓
Connector detecta erro e retorna:
  {
    code: "BP335",
    message: "Cancel aborted by Split transactional error. Please use voucher refund instead.",
    error: {
      requiresVoucherRefund: true,
      providerReturnCode: "BP335",
      voidSplitErrors: [...]
    }
  }
  ↓
Frontend detecta requiresVoucherRefund: true
  ↓
Frontend chama POST /_v/pix-connector/refund/voucher
  ↓
Processa reembolso via voucher (Cenário 1)
```

## Código Implementado

### 1. Detecção do Erro BP335

**Arquivo:** `node/services/operations/index.ts`

```typescript
const voidResponse = await braspagClient.voidPixPayment(payment.PaymentId)

const isSplitError =
  voidResponse.ProviderReturnCode === 'BP335' ||
  voidResponse.ReasonCode === 37 ||
  voidResponse.ReasonMessage === 'SplitTransactionalError'

if (isSplitError) {
  return Cancellations.deny(cancellation, {
    code: 'BP335',
    message: 'Cancel aborted by Split transactional error. Please use voucher refund instead.',
    error: {
      requiresVoucherRefund: true,
      providerReturnCode: voidResponse.ProviderReturnCode,
      voidSplitErrors: voidResponse.VoidSplitErrors,
    },
  })
}
```

### 2. Cancelamento de Pedido na VTEX

**Arquivo:** `node/clients/orders/index.ts`

```typescript
public async cancelOrder(orderId: string, reason?: string): Promise<void> {
  await this.http.post(
    `/api/oms/pvt/orders/${orderId}/cancel`,
    { reason: reason || 'Reembolso via voucher' },
    { metric: 'oms-cancel-order', timeout: 10000 }
  )
}
```

### 3. Voucher Refund com Cancelamento VTEX

**Arquivo:** `node/services/voucher-refund/index.ts`

```typescript
// Cria gift card
const giftcardResult = await this.deps.giftcardsClient.createRefundVoucher({
  userId,
  refundValue,
  orderId,
})

// Cancela pedido na VTEX (SEM chamar Braspag)
await this.deps.ordersClient.cancelOrder(
  orderId,
  'Reembolso via voucher - Gift card criado'
)

// Atualiza status do pagamento
await this.deps.storageService.updatePaymentStatus(paymentId, 11)
```

## Tipos Atualizados

### VoidPixResponse

**Arquivo:** `node/clients/braspag/types.ts`

```typescript
export type VoidSplitError = {
  Code: number
  Message: string
}

export type VoidPixResponse = {
  Status?: number
  Message?: string
  ReasonCode?: number
  ReasonMessage?: string
  ProviderReturnCode?: string
  ProviderReturnMessage?: string
  VoidSplitErrors?: VoidSplitError[]
  Links?: Array<{
    Method: string
    Rel: string
    Href: string
  }>
}
```

## Tratamento de Erros

### Erro BP335 na Resposta (HTTP 200)

A Braspag pode retornar HTTP 200 com o erro BP335 no body. O código detecta isso:

```typescript
const response = await braspagClient.voidPixPayment(paymentId)

if (response.ProviderReturnCode === 'BP335') {
  // Trata como erro de split
}
```

### Erro BP335 em Exceção (HTTP 4xx/5xx)

Se vier como exceção, também é tratado:

```typescript
catch (error) {
  const errorData = error?.response?.data as VoidPixResponse
  
  if (errorData?.ProviderReturnCode === 'BP335') {
    // Retorna resposta com requiresVoucherRefund: true
  }
}
```

## Logging

Todos os eventos são logados:

```
PIX CANCELLATION: Split transactional error detected, voucher refund required
BRASPAG: VOID_PIX_PAYMENT returned split error
VOUCHER_REFUND: Cancelling order in VTEX
VOUCHER_REFUND: Order cancelled successfully in VTEX
```

## Exemplo de Resposta BP335

Quando o estorno falha com BP335, o connector retorna:

```json
{
  "code": "BP335",
  "message": "Cancel aborted by Split transactional error. Please use voucher refund instead.",
  "error": {
    "requiresVoucherRefund": true,
    "providerReturnCode": "BP335",
    "providerReturnMessage": "Cancel aborted by Split transactional error",
    "reasonCode": 37,
    "reasonMessage": "SplitTransactionalError",
    "voidSplitErrors": [
      {
        "Code": 326,
        "Message": "Requested Revert amount for Merchant Id d23429c6-4cdc-484e-9dfa-a8ecd5ea539c is higher than avaliable amount (748)"
      }
    ]
  }
}
```

## Integração Frontend

O frontend deve:

1. **Detectar `requiresVoucherRefund: true`** na resposta do cancelamento
2. **Chamar automaticamente** `POST /_v/pix-connector/refund/voucher`
3. **Exibir código de resgate** do voucher ao cliente

### Exemplo de Código Frontend

```typescript
try {
  const cancelResponse = await cancelPayment(paymentId)
  
  if (cancelResponse.error?.requiresVoucherRefund) {
    // Fallback automático para voucher
    const voucherResponse = await refundViaVoucher({
      orderId,
      paymentId,
      userId,
      refundValue: paymentAmount,
    })
    
    showVoucherCode(voucherResponse.redemptionCode)
  } else {
    showSuccessMessage('Reembolso processado com sucesso')
  }
} catch (error) {
  showErrorMessage('Erro ao processar reembolso')
}
```

## Testes

### Teste 1: BP335 Detectado Corretamente

```typescript
const mockBraspagResponse: VoidPixResponse = {
  Status: 2,
  ReasonCode: 37,
  ReasonMessage: 'SplitTransactionalError',
  ProviderReturnCode: 'BP335',
  VoidSplitErrors: [
    { Code: 326, Message: 'Requested Revert amount is higher than available' }
  ]
}

const result = await cancelPayment(cancellation)

expect(result.code).toBe('BP335')
expect(result.error.requiresVoucherRefund).toBe(true)
```

### Teste 2: Voucher Refund Cancela Pedido VTEX

```typescript
const result = await refundViaVoucher({
  orderId: 'v123-01',
  paymentId: 'PAY123',
  userId: 'USR456',
  refundValue: 10000
})

expect(result.success).toBe(true)
expect(mockOrdersClient.cancelOrder).toHaveBeenCalledWith(
  'v123-01',
  'Reembolso via voucher - Gift card criado'
)
```

## Referências

- [Braspag API Error Codes](https://docs.cielo.com.br/gateway-en/reference/api-error-codes)
- Erro BP335: "Cancel aborted by Split transactional error"
- ReasonCode 37: "SplitTransactionalError"

