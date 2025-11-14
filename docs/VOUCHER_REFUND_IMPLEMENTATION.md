# Implementação: Rota de Reembolso via Voucher

## Resumo Técnico

Foi implementada uma rota customizada para processar reembolsos de pagamentos PIX através da criação de gift cards (vouchers), seguindo o fluxograma fornecido.

## Estrutura Implementada

### 1. Client de Integração

**Arquivo:** `node/clients/giftcards/index.ts`

```typescript
export class GiftcardsClient extends ExternalClient {
  public async createRefundVoucher(
    request: RefundVoucherRequest
  ): Promise<RefundVoucherResponse>
}
```

**Função:** Consome a API do app `marykay.giftcards-integration` para criar e creditar gift cards.

### 2. Tipos e Interfaces

**Arquivo:** `node/services/voucher-refund/types.ts`

**Principais tipos:**
- `VoucherRefundRequest` - Dados da requisição
- `VoucherRefundResponse` - Dados da resposta
- `VoucherRefundService` - Interface do serviço
- `VoucherRefundServiceDeps` - Dependências

### 3. Service (Business Logic)

**Arquivo:** `node/services/voucher-refund/index.ts`

```typescript
export class VoucherRefundServiceImpl implements VoucherRefundService {
  public async processVoucherRefund(
    request: VoucherRefundRequest
  ): Promise<VoucherRefundResponse>
}
```

**Lógica implementada:**
1. Busca dados do pagamento no VBase
2. Valida status (não reembolsado/cancelado)
3. Valida valor do reembolso
4. Chama app de giftcards para criar voucher
5. Atualiza status do pagamento para 11 (Refunded)
6. Retorna dados do gift card criado

### 4. Rota Pública

**Arquivo:** `node/service.json`

```json
{
  "voucherRefund": {
    "path": "/_v/pix-connector/refund/voucher",
    "public": true
  }
}
```

### 5. Middleware e Handler

**Arquivo:** `node/middlewares/voucher-refund/index.ts`

```typescript
export async function voucherRefundHandler(ctx: Context, next: () => Promise<void>)
```

**Responsabilidades:**
- Parse do body da requisição
- Validação de campos obrigatórios
- Instanciação do service
- Tratamento de erros
- Formatação da resposta

### 6. Integração no Service Principal

**Arquivo:** `node/index.ts`

```typescript
routes: {
  voucherRefund: method({
    POST: [voucherRefundHandler],
  }),
}
```

## Fluxo de Execução

```
POST /_v/pix-connector/refund/voucher
  ↓
voucherRefundHandler (middleware)
  ↓
VoucherRefundServiceImpl.processVoucherRefund
  ↓
1. PaymentStorageService.getPayment(paymentId)
2. Validações (status, valor)
3. GiftcardsClient.createRefundVoucher(userId, refundValue, orderId)
4. PaymentStorageService.updatePaymentStatus(paymentId, 11)
  ↓
Retorna VoucherRefundResponse
```

## Validações Implementadas

### 1. Campos Obrigatórios
- `orderId` (string)
- `paymentId` (string)
- `userId` (string)
- `refundValue` (number)

### 2. Validações de Negócio
- Pagamento existe no VBase
- Pagamento não está já reembolsado (status !== 11)
- Pagamento não está já cancelado (status !== 10)
- Valor do reembolso ≤ valor do pagamento

### 3. Tratamento de Erros
- 400: Campos obrigatórios ausentes
- 500: Pagamento não encontrado
- 500: Valor de reembolso excede pagamento
- 500: Erro ao criar gift card

## Logging e Auditoria

Todos os eventos são logados via Datadog:

```typescript
VOUCHER_REFUND_HANDLER: Received request
VOUCHER_REFUND: Starting process
VOUCHER_REFUND: Payment not found (erro)
VOUCHER_REFUND: Payment already refunded/cancelled (warning)
VOUCHER_REFUND: Refund value exceeds payment amount (erro)
VOUCHER_REFUND: Creating giftcard via app
VOUCHER_REFUND: Giftcard created successfully
VOUCHER_REFUND: Payment status updated to 11
```

## Exemplo de Uso

### Request

```bash
curl -X POST https://{account}.myvtex.com/_v/pix-connector/refund/voucher \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "v123456789abc-01",
    "paymentId": "A1B2C3D4E5F6G7H8I9J0",
    "userId": "12345678-1234-1234-1234-123456789abc",
    "refundValue": 11350
  }'
```

### Response (Sucesso)

```json
{
  "success": true,
  "giftCardId": "MKGC-2024-123456",
  "redemptionCode": "ABCD-1234-EFGH-5678",
  "refundValue": 11350,
  "orderId": "v123456789abc-01",
  "message": "Voucher refund processed successfully"
}
```

### Response (Erro)

```json
{
  "success": false,
  "message": "Missing required fields: orderId, paymentId, userId, refundValue"
}
```

## Dependências

### Clients Registrados

**Arquivo:** `node/clients/index.ts`

```typescript
public get giftcards() {
  return this.getOrSet('giftcards', GiftcardsClient)
}
```

**Configuração:**
```typescript
giftcards: {
  retries: 3,
  timeout: THIRTY_SECONDS,
}
```

### Integração com App Gift Cards

A implementação depende do app `marykay.giftcards-integration` estar instalado e funcional:

**Endpoint consumido:**
```
POST http://{account}.vtex.local/_v/refund
```

**Payload:**
```typescript
{
  userId: string
  refundValue: number
  orderId: string
}
```

**Resposta esperada:**
```typescript
{
  giftCardId: string
  redemptionCode: string
}
```

## Próximas Etapas de Integração

### Frontend (Admin/MyAccount)

1. Adicionar botão "Reembolso via Voucher" em "Meus Pedidos"
2. Implementar modal de confirmação
3. Chamar endpoint `POST /_v/pix-connector/refund/voucher`
4. Exibir código de resgate ao cliente

### Backend (Decisão Automática)

Implementar lógica para decidir automaticamente quando apresentar opção de voucher:

```typescript
const shouldOfferVoucher = (order) => {
  const isPix = order.paymentMethod === 'PIX'
  const isPaid = order.paymentStatus === 2
  const isSplitProcessed = order.splitStatus === 'processed'
  const isDelivered = order.deliveryStatus === 'delivered'
  
  return isPix && isPaid && (isSplitProcessed || isDelivered)
}
```

### Notificações

1. Email com código de resgate
2. Push notification no app
3. SMS (opcional)

### Dashboard Admin

1. Relatório de vouchers emitidos
2. Valor total de reembolsos via voucher
3. Taxa de utilização de vouchers
4. Vouchers expirados

## Testes Recomendados

### 1. Teste de Sucesso
```typescript
const response = await axios.post('/_v/pix-connector/refund/voucher', {
  orderId: 'v123-01',
  paymentId: 'PAY123',
  userId: 'USR456',
  refundValue: 10000
})

expect(response.data.success).toBe(true)
expect(response.data.giftCardId).toBeDefined()
```

### 2. Teste de Validação
```typescript
const response = await axios.post('/_v/pix-connector/refund/voucher', {
  orderId: 'v123-01',
  // paymentId ausente
  userId: 'USR456',
  refundValue: 10000
})

expect(response.status).toBe(400)
```

### 3. Teste de Idempotência
```typescript
// Primeira chamada
await voucherRefundService.processVoucherRefund(request)

// Segunda chamada com mesmo paymentId
const result = await voucherRefundService.processVoucherRefund(request)

expect(result.success).toBe(false)
expect(result.message).toContain('already refunded')
```

## Compliance

### LGPD
- userId é tratado como identificador interno
- Nenhum dado pessoal sensível é logado
- Dados são persistidos apenas no VBase VTEX

### PCI-DSS
- Nenhum dado de cartão é manipulado
- Integração com APIs VTEX nativas (certificadas)

### Auditoria
- Todos os eventos são logados no Datadog
- Tracking de reembolsos no Masterdata (via app giftcards)
- Histórico de status no VBase

