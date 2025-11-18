# Padrão de Logs Estratégicos para Datadog

## Princípios

1. **Logs concisos e objetivos** - Apenas informações necessárias
2. **Chaves estratégicas** - Facilitar filtros no Datadog
3. **Prefixos padronizados** - Identificação rápida do fluxo
4. **Dados essenciais** - IDs, status, valores, erros

## Estrutura Padrão

```typescript
this.deps.logger.info('[PREFIX] Action description', {
  flow: 'flow_name',
  action: 'action_name',
  paymentId: 'xxx',
  orderId: 'xxx',
  ...campos_relevantes
})
```

## Prefixos Padronizados

- `[PIX_AUTH]` - Fluxo de autorização
- `[PIX_CANCEL]` - Fluxo de cancelamento
- `[PIX_REFUND]` - Fluxo de reembolso
- `[PIX_SETTLE]` - Fluxo de settlement/liquidação
- `[PIX_VOUCHER]` - Fluxo de geração de voucher
- `[BRASPAG_API]` - Chamadas à API Braspag
- `[NOTIFICATION]` - Processamento de notificações

## Chaves Estratégicas (sempre incluir quando aplicável)

### Chaves Obrigatórias
```typescript
{
  flow: string,              // authorization | cancellation | refund | settlement | voucher
  action: string,            // create_pix | void_pix | generate_voucher | etc
  paymentId: string,         // ID do payment VTEX
  orderId: string,           // ID do pedido VTEX
}
```

### Chaves Contextuais
```typescript
{
  pixPaymentId: string,      // ID do payment Braspag
  transactionId: string,     // Transaction ID Braspag
  status: number,            // Status do payment
  value: number,             // Valor em centavos
  merchantId: string,        // ID do merchant Braspag
  hasSplit: boolean,         // Se tem split payment
  splitCount: number,        // Quantidade de splits
  consultantId: string,      // ID da consultora
  braspagId: string,         // ID Braspag da consultora
  userId: string,            // ID do usuário/cliente
  giftCardId: string,        // ID do gift card gerado
  redemptionCode: string,    // Código de resgate do voucher
}
```

### Chaves de Erro
```typescript
{
  error: string,             // Mensagem de erro
  errorCode: string,         // Código do erro
  providerReturnCode: string, // Código retornado pelo provider
  reasonCode: number,        // Código de razão Braspag
  reasonMessage: string,     // Mensagem de razão Braspag
}
```

## Logs Estratégicos por Fluxo

### 1. AUTHORIZATION (PIX_AUTH)

#### 1.1 Payment existente encontrado
```typescript
this.deps.logger.info('[PIX_AUTH] Existing payment found', {
  flow: 'authorization',
  action: 'existing_payment',
  paymentId: authorization.paymentId,
  pixPaymentId: existingPayment.pixPaymentId,
  status: existingPayment.status,
  orderId: authorization.orderId,
})
```

#### 1.2 Iniciando criação do PIX
```typescript
this.deps.logger.info('[PIX_AUTH] Creating PIX payment', {
  flow: 'authorization',
  action: 'create_pix',
  paymentId: authorization.paymentId,
  transactionId: authorization.transactionId,
  orderId: authorization.orderId,
  value: authorization.value,
  merchantId: merchantSettings.merchantId,
  hasSplit: !!pixRequest.Payment?.SplitPayments?.length,
  splitCount: pixRequest.Payment?.SplitPayments?.length ?? 0,
  consultantId: orderData?.consultantId,
  braspagId: orderData?.braspagId,
})
```

#### 1.3 Payment criado com sucesso
```typescript
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
```

#### 1.4 Erro na criação (aborted)
```typescript
this.deps.logger.error('[PIX_AUTH] Payment aborted', {
  flow: 'authorization',
  action: 'payment_aborted',
  paymentId: authorization.paymentId,
  pixPaymentId: payment.PaymentId,
  orderId: authorization.orderId,
  status: payment.Status,
})
```

### 2. CANCELLATION (PIX_CANCEL)

#### 2.1 Iniciando cancelamento
```typescript
this.deps.logger.info('[PIX_CANCEL] Starting cancellation', {
  flow: 'cancellation',
  action: 'start_cancel',
  paymentId: cancellation.paymentId,
  pixPaymentId: storedPayment.pixPaymentId,
  orderId: storedPayment.orderId,
  status: storedPayment.status,
  value: storedPayment.amount,
})
```

#### 2.2 Erro de split detectado (BP335)
```typescript
this.deps.logger.warn('[PIX_CANCEL] Split error - generating voucher', {
  flow: 'cancellation',
  action: 'split_error_detected',
  paymentId: cancellation.paymentId,
  orderId: storedPayment.orderId,
  providerReturnCode: voidResponse.ProviderReturnCode,
  reasonCode: voidResponse.ReasonCode,
  reasonMessage: voidResponse.ReasonMessage,
  value: storedPayment.amount,
})
```

#### 2.3 Cancelamento bem-sucedido
```typescript
this.deps.logger.info('[PIX_CANCEL] Payment cancelled successfully', {
  flow: 'cancellation',
  action: 'cancel_success',
  paymentId: cancellation.paymentId,
  pixPaymentId: storedPayment.pixPaymentId,
  orderId: storedPayment.orderId,
  status: voidResponse.Status,
})
```

### 3. VOUCHER GENERATION (PIX_VOUCHER)

#### 3.1 Iniciando geração de voucher
```typescript
this.deps.logger.info('[PIX_VOUCHER] Starting voucher generation', {
  flow: 'voucher_refund',
  action: 'start_voucher',
  paymentId: request.paymentId,
  orderId: request.orderId,
  userId: request.userId,
  refundValue: request.refundValue,
})
```

#### 3.2 Voucher gerado com sucesso
```typescript
this.deps.logger.info('[PIX_VOUCHER] Voucher generated successfully', {
  flow: 'voucher_refund',
  action: 'voucher_created',
  paymentId: request.paymentId,
  orderId: request.orderId,
  userId: request.userId,
  giftCardId: voucherResult.giftCardId,
  redemptionCode: voucherResult.redemptionCode,
  refundValue: request.refundValue,
})
```

#### 3.3 Erro na geração do voucher
```typescript
this.deps.logger.error('[PIX_VOUCHER] Voucher generation failed', {
  flow: 'voucher_refund',
  action: 'voucher_failed',
  paymentId: request.paymentId,
  orderId: request.orderId,
  userId: request.userId,
  error: error.message,
})
```

### 4. REFUND (PIX_REFUND)

#### 4.1 Iniciando reembolso
```typescript
this.deps.logger.info('[PIX_REFUND] Starting refund', {
  flow: 'refund',
  action: 'start_refund',
  paymentId: refund.paymentId,
  pixPaymentId: storedPayment.pixPaymentId,
  orderId: storedPayment.orderId,
  value: storedPayment.amount,
})
```

#### 4.2 Erro de split - voucher automático
```typescript
this.deps.logger.warn('[PIX_REFUND] Split error - generating voucher', {
  flow: 'refund',
  action: 'split_error_detected',
  paymentId: refund.paymentId,
  orderId: storedPayment.orderId,
  providerReturnCode: voidResponse.ProviderReturnCode,
  reasonCode: voidResponse.ReasonCode,
})
```

#### 4.3 Reembolso bem-sucedido
```typescript
this.deps.logger.info('[PIX_REFUND] Refund completed', {
  flow: 'refund',
  action: 'refund_success',
  paymentId: refund.paymentId,
  pixPaymentId: storedPayment.pixPaymentId,
  orderId: storedPayment.orderId,
  status: voidResponse.Status,
})
```

### 5. SETTLEMENT (PIX_SETTLE)

#### 5.1 Iniciando settlement
```typescript
this.deps.logger.info('[PIX_SETTLE] Processing settlement', {
  flow: 'settlement',
  action: 'start_settlement',
  paymentId: settlement.paymentId,
  value: settlement.value,
  tid: settlement.tid,
})
```

#### 5.2 Settlement aprovado
```typescript
this.deps.logger.info('[PIX_SETTLE] Settlement approved', {
  flow: 'settlement',
  action: 'settlement_approved',
  paymentId: settlement.paymentId,
  pixPaymentId: storedPayment.pixPaymentId,
  orderId: storedPayment.orderId,
  value: storedPayment.amount,
  status: storedPayment.status,
  hasSplit: !!storedPayment.splitPayments?.length,
})
```

#### 5.3 Settlement negado
```typescript
this.deps.logger.warn('[PIX_SETTLE] Settlement denied', {
  flow: 'settlement',
  action: 'settlement_denied',
  paymentId: settlement.paymentId,
  status: storedPayment.status,
  reason: 'invalid_status',
})
```

### 6. BRASPAG API (BRASPAG_API)

#### 6.1 Criando pagamento PIX
```typescript
this.logger.info('[BRASPAG_API] Creating PIX sale', {
  flow: 'braspag_api',
  action: 'create_pix_sale',
  merchantOrderId: payload.MerchantOrderId,
  amount: payload.Payment?.Amount,
  hasSplit: !!payload.Payment?.SplitPayments?.length,
})
```

#### 6.2 Void payment
```typescript
this.logger.info('[BRASPAG_API] Voiding payment', {
  flow: 'braspag_api',
  action: 'void_payment',
  paymentId,
})
```

#### 6.3 Erro de split detectado
```typescript
this.logger.warn('[BRASPAG_API] Split error detected', {
  flow: 'braspag_api',
  action: 'split_error',
  paymentId,
  providerReturnCode: response.ProviderReturnCode,
  reasonCode: response.ReasonCode,
  reasonMessage: response.ReasonMessage,
})
```

### 7. NOTIFICATION (NOTIFICATION)

#### 7.1 Notificação recebida
```typescript
this.logger.info('[NOTIFICATION] Received', {
  flow: 'notification',
  action: 'received',
  paymentId: notification.PaymentId,
  changeType: notification.ChangeType,
  status: notification.Status,
})
```

#### 7.2 Status atualizado
```typescript
this.logger.info('[NOTIFICATION] Status updated', {
  flow: 'notification',
  action: 'status_updated',
  paymentId,
  oldStatus: storedPayment.status,
  newStatus: effectiveStatus,
  vtexPaymentId: storedPayment.vtexPaymentId,
})
```

## Filtros Úteis no Datadog

### Por Fluxo
```
@flow:authorization
@flow:cancellation
@flow:refund
@flow:settlement
@flow:voucher_refund
```

### Por Action
```
@action:create_pix
@action:split_error_detected
@action:voucher_created
@action:payment_aborted
```

### Por Payment ID
```
@paymentId:"674E2D0A7EF247E1900F757A497248C3"
```

### Por Order ID
```
@orderId:"1576960500427"
```

### Combinados
```
@flow:cancellation @action:split_error_detected
@flow:voucher_refund @action:voucher_created
@providerReturnCode:BP335
```

## O que NÃO logar

❌ Dados sensíveis completos (CPF, cartões, senhas)
❌ Payloads completos (exceto em debug específico)
❌ Stack traces excessivos (apenas mensagem principal)
❌ Logs em loops sem controle
❌ Dados redundantes já logados anteriormente no mesmo fluxo
❌ Console.log (usar sempre o logger estruturado)

## O que SEMPRE logar

✅ Início e fim de operações principais
✅ Erros e exceções
✅ Mudanças de status
✅ IDs de rastreamento (paymentId, orderId, pixPaymentId)
✅ Valores monetários em operações críticas
✅ Códigos de erro de providers externos
✅ Resultados de gerações de voucher

## Exemplo Completo de Fluxo com Erro de Split

```typescript
// 1. Início do cancelamento
this.deps.logger.info('[PIX_CANCEL] Starting cancellation', {
  flow: 'cancellation',
  action: 'start_cancel',
  paymentId: '674E2D0A...',
  pixPaymentId: 'bde00b05...',
  orderId: '1576960500427',
  status: 2,
  value: 1135,
})

// 2. Erro de split detectado
this.deps.logger.warn('[PIX_CANCEL] Split error - generating voucher', {
  flow: 'cancellation',
  action: 'split_error_detected',
  paymentId: '674E2D0A...',
  orderId: '1576960500427',
  providerReturnCode: 'BP335',
  reasonCode: 37,
  reasonMessage: 'SplitTransactionalError',
  value: 1135,
})

// 3. Iniciando voucher
this.deps.logger.info('[PIX_VOUCHER] Starting voucher generation', {
  flow: 'voucher_refund',
  action: 'start_voucher',
  paymentId: '674E2D0A...',
  orderId: '1576960500427',
  userId: '6aee88f2...',
  refundValue: 1135,
})

// 4. Voucher gerado
this.deps.logger.info('[PIX_VOUCHER] Voucher generated successfully', {
  flow: 'voucher_refund',
  action: 'voucher_created',
  paymentId: '674E2D0A...',
  orderId: '1576960500427',
  userId: '6aee88f2...',
  giftCardId: 'GC123',
  redemptionCode: 'ABC123',
  refundValue: 1135,
})

// 5. Cancelamento aprovado via voucher
this.deps.logger.info('[PIX_CANCEL] Cancelled via voucher', {
  flow: 'cancellation',
  action: 'cancel_via_voucher',
  paymentId: '674E2D0A...',
  orderId: '1576960500427',
  giftCardId: 'GC123',
  redemptionCode: 'ABC123',
})
```
