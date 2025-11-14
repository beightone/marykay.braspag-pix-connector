# API de Reembolso via Voucher

## Visão Geral

Esta API descreve o endpoint REST para processar reembolsos de pagamentos PIX através da criação de vouchers (gift cards). Quando um cliente solicita o cancelamento de uma compra e opta por reembolso via voucher, o sistema cria um gift card com o valor do reembolso que pode ser utilizado em compras futuras.

## Autenticação

Os endpoints são públicos e não requerem autenticação externa. A autenticação é gerenciada internamente pelo VTEX IO através dos tokens de contexto.

## Tratamento de Erros

Todos os erros seguem o padrão HTTP com códigos de status apropriados:

- `400 Bad Request`: Requisição inválida ou campos obrigatórios ausentes
- `404 Not Found`: Pagamento não encontrado
- `500 Internal Server Error`: Erro interno no processamento

**Formato de Resposta de Erro:**

```json
{
  "success": false,
  "message": "Descrição do erro"
}
```

## Endpoints

### 1. Processar Reembolso via Voucher

**Método:** `POST`  
**URL:** `/_v/pix-connector/refund/voucher`

#### Request Body

| Campo | Tipo | Descrição | Obrigatório |
|-------|------|-----------|-------------|
| orderId | string | Identificador único do pedido na VTEX | Sim |
| paymentId | string | Identificador único do pagamento | Sim |
| userId | string | Identificador do usuário/cliente (profileId) | Sim |
| refundValue | number | Valor do reembolso em centavos (ex: 10000 = R$ 100,00) | Sim |

**Exemplo de Requisição:**

```json
{
  "orderId": "v123456789abc-01",
  "paymentId": "A1B2C3D4E5F6G7H8I9J0",
  "userId": "12345678-1234-1234-1234-123456789abc",
  "refundValue": 11350
}
```

#### Resposta de Sucesso

**Status Code:** `200 OK`

**Exemplo de Resposta:**

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

**Descrição dos Campos de Resposta:**

- `success` (boolean): Indica se o reembolso foi processado com sucesso
- `giftCardId` (string): ID único do gift card criado no sistema VTEX
- `redemptionCode` (string): Código de resgate que o cliente utilizará para usar o voucher
- `refundValue` (number): Valor reembolsado em centavos
- `orderId` (string): ID do pedido original
- `message` (string): Mensagem descritiva do resultado

#### Cenários de Erro

**1. Campos obrigatórios ausentes**

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Missing required fields: orderId, paymentId, userId, refundValue"
}
```

**2. Pagamento não encontrado**

**Status Code:** `500 Internal Server Error`

```json
{
  "success": false,
  "message": "Payment A1B2C3D4E5F6G7H8I9J0 not found"
}
```

**3. Pagamento já reembolsado**

**Status Code:** `200 OK`

```json
{
  "success": false,
  "giftCardId": "",
  "redemptionCode": "",
  "refundValue": 0,
  "orderId": "v123456789abc-01",
  "message": "Payment already refunded or cancelled"
}
```

**4. Valor de reembolso excede valor do pagamento**

**Status Code:** `500 Internal Server Error`

```json
{
  "success": false,
  "message": "Refund value (15000) exceeds payment amount (11350)"
}
```

## Fluxo de Integração

1. Cliente solicita cancelamento no portal "Meus Pedidos"
2. Sistema identifica o método de pagamento original (PIX)
3. Para PIX com Split já pago/usado, apresenta opções: "Reembolso PIX" ou "Voucher"
4. Se cliente escolhe "Voucher":
   - Frontend chama `POST /_v/pix-connector/refund/voucher`
   - Backend valida o pagamento
   - Backend cria gift card via app `marykay.giftcards-integration`
   - Backend atualiza status do pagamento para 11 (Refunded)
   - Retorna `giftCardId` e `redemptionCode` para o cliente
5. Cliente recebe notificação com código de resgate
6. Cliente pode usar o voucher em compras futuras

## Observações Importantes

- O voucher tem validade de 1 ano a partir da criação
- O valor do reembolso é creditado integralmente no gift card
- Uma vez criado o voucher, o pagamento original é marcado como reembolsado (status 11)
- O voucher pode ser usado em múltiplas compras até esgotar o saldo
- Para pagamentos com split, o sistema considera apenas o valor efetivamente pago (não considera valores já pagos com gift card anteriormente)

