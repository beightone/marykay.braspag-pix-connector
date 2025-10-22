# 🔄 Fluxo Técnico Completo - Mary Kay Braspag PIX Connector

## 📊 Diagrama de Sequência Completo

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐     ┌───────────┐
│ Cliente │     │  VTEX    │     │  PPF     │     │ Braspag │     │   Banco   │
│         │     │ Checkout │     │Connector │     │   API   │     │  Cliente  │
└────┬────┘     └────┬─────┘     └────┬─────┘     └────┬────┘     └─────┬─────┘
     │               │                │                │                 │
     │ 1. Finaliza   │                │                │                 │
     │    compra     │                │                │                 │
     ├──────────────>│                │                │                 │
     │               │                │                │                 │
     │               │ 2. authorize() │                │                 │
     │               ├───────────────>│                │                 │
     │               │                │                │                 │
     │               │                │ 3. OAuth2      │                 │
     │               │                ├───────────────>│                 │
     │               │                │                │                 │
     │               │                │ 4. Access Token│                 │
     │               │                │<───────────────┤                 │
     │               │                │                │                 │
     │               │                │ 5. POST /v2/   │                 │
     │               │                │    sales       │                 │
     │               │                ├───────────────>│                 │
     │               │                │                │                 │
     │               │                │ {              │                 │
     │               │                │   MerchantOrderId,              │
     │               │                │   Customer,    │                 │
     │               │                │   Payment: {   │                 │
     │               │                │     Type: "Pix",                │
     │               │                │     Amount,    │                 │
     │               │                │     SplitPayments: [            │
     │               │                │       {        │                 │
     │               │                │         SubordinateMerchantId,  │
     │               │                │         Amount: 7500 (75%)      │
     │               │                │       },       │                 │
     │               │                │       {        │                 │
     │               │                │         SubordinateMerchantId,  │
     │               │                │         Amount: 2500 (25%)      │
     │               │                │       }        │                 │
     │               │                │     ]          │                 │
     │               │                │   }            │                 │
     │               │                │ }              │                 │
     │               │                │                │                 │
     │               │                │ 6. Response    │                 │
     │               │                │    QR Code +   │                 │
     │               │                │    PaymentId   │                 │
     │               │                │<───────────────┤                 │
     │               │                │                │                 │
     │               │                │ {              │                 │
     │               │                │   Payment: {   │                 │
     │               │                │     PaymentId, │                 │
     │               │                │     Status: 12,│                 │
     │               │                │     QrCodeBase64Image,           │
     │               │                │     QrCodeString                 │
     │               │                │   }            │                 │
     │               │                │ }              │                 │
     │               │                │                │                 │
     │               │ 7. Salva VBase │                │                 │
     │               │    + retorna   │                │                 │
     │               │<───────────────┤                │                 │
     │               │                │                │                 │
     │               │ {              │                │                 │
     │               │   status: "pending",            │                 │
     │               │   tid: PaymentId,               │                 │
     │               │   paymentAppData: {             │                 │
     │               │     payload: JSON.stringify({   │                 │
     │               │       code,    │                │                 │
     │               │       qrCodeBase64Image         │                 │
     │               │     })         │                │                 │
     │               │   }            │                │                 │
     │               │ }              │                │                 │
     │               │                │                │                 │
     │ 8. Renderiza  │                │                │                 │
     │    Payment    │                │                │                 │
     │    App        │                │                │                 │
     │<──────────────┤                │                │                 │
     │               │                │                │                 │
     │ [Payment App exibe QR Code + Código]           │                 │
     │ [Timer: 2 horas de expiração]                  │                 │
     │ [Polling de status a cada 5s]                  │                 │
     │               │                │                │                 │
     │ 9. Abre app   │                │                │                 │
     │    do banco   │                │                │                 │
     ├──────────────────────────────────────────────────────────────────>│
     │               │                │                │                 │
     │ 10. Escaneia  │                │                │                 │
     │     QR Code   │                │                │                 │
     ├──────────────────────────────────────────────────────────────────>│
     │               │                │                │                 │
     │ 11. Confirma  │                │                │                 │
     │     pagamento │                │                │                 │
     ├──────────────────────────────────────────────────────────────────>│
     │               │                │                │                 │
     │               │                │                │ 12. Processa   │
     │               │                │                │     PIX        │
     │               │                │                │<────────────────┤
     │               │                │                │                 │
     │               │                │                │ 13. Executa    │
     │               │                │                │     Split      │
     │               │                │                │     75% → Consultora         │
     │               │                │                │     25% → Marketplace        │
     │               │                │                │                 │
     │               │                │                │ 14. Atualiza   │
     │               │                │                │     Status: 2  │
     │               │                │                │                 │
     │               │                │ 15. Webhook    │                 │
     │               │                │    Notification│                 │
     │               │                │<───────────────┤                 │
     │               │                │                │                 │
     │               │                │ POST /_v/braspag-pix-connector/ │
     │               │                │      v0/notifications            │
     │               │                │                │                 │
     │               │                │ {              │                 │
     │               │                │   PaymentId,   │                 │
     │               │                │   ChangeType: 1,                 │
     │               │                │   Status: 2,   │                 │
     │               │                │   MerchantOrderId,               │
     │               │                │   Amount       │                 │
     │               │                │ }              │                 │
     │               │                │                │                 │
     │               │                │ 16. Atualiza   │                 │
     │               │                │     VBase      │                 │
     │               │                │                │                 │
     │               │                │ 17. Forward    │                 │
     │               │                │     to Store   │                 │
     │               │                │     Services   │                 │
     │               │                │                │                 │
     │               │ 18. Polling    │                │                 │
     │               │     detecta    │                │                 │
     │               │     status=paid│                │                 │
     │<──────────────┤                │                │                 │
     │               │                │                │                 │
     │ 19. Exibe     │                │                │                 │
     │    "Pago!"    │                │                │                 │
     │               │                │                │                 │
     │               │ 20. settle()   │                │                 │
     │               ├───────────────>│                │                 │
     │               │                │                │                 │
     │               │                │ 21. GET /v2/   │                 │
     │               │                │     sales/{id} │                 │
     │               │                ├───────────────>│                 │
     │               │                │                │                 │
     │               │                │ 22. Status: 2  │                 │
     │               │                │     (Paid)     │                 │
     │               │                │<───────────────┤                 │
     │               │                │                │                 │
     │               │ 23. Approve    │                │                 │
     │               │     Settlement │                │                 │
     │               │<───────────────┤                │                 │
     │               │                │                │                 │
     │ 24. Redireciona                │                │                 │
     │     para Success                │                │                 │
     │<──────────────┤                │                │                 │
     │               │                │                │                 │
```

---

## 🔍 Estados e Transições

### Máquina de Estados do Pagamento PIX

```
┌──────────────────────────────────────────────────────────────────┐
│                      CICLO DE VIDA DO PAGAMENTO                  │
└──────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   NOT STARTED   │
                    └────────┬────────┘
                             │
                             │ authorize()
                             ▼
                    ┌─────────────────┐
              ┌─────│  PENDING (12)   │─────┐
              │     └─────────────────┘     │
              │                             │
      cancel()│                             │ Cliente paga
              │                             │
              ▼                             ▼
     ┌─────────────────┐         ┌─────────────────┐
     │   VOIDED (10)   │         │    PAID (2)     │
     └─────────────────┘         └────────┬────────┘
              │                            │
              │                            │ settle()
              │                            │
              │                            ▼
              │                   ┌─────────────────┐
              │                   │   SETTLED (2)   │
              │                   └─────────────────┘
              │                            │
              │                            │
              │                            │
              ▼                            ▼
     ┌─────────────────┐         ┌─────────────────┐
     │   CANCELLED     │         │   COMPLETED     │
     └─────────────────┘         └─────────────────┘


Estados possíveis:
- 0  (NOT_FINISHED): Não finalizado
- 1  (PENDING): Pendente
- 2  (PAID): Pago ✅ [Split executado]
- 3  (DENIED): Negado
- 10 (VOIDED): Cancelado
- 11 (REFUNDED): Estornado
- 12 (PENDING_AUTHORIZATION): Aguardando autorização [Estado inicial]
- 13 (ABORTED): Abortado
- 20 (SCHEDULED): Agendado
```

---

## 🎯 Pontos de Integração

### 1. **Autorização (Authorization)**

**Endpoint VTEX:** `POST /_v/api/marykay.braspag-pix-connector/payments`

**Input:**
```json
{
  "paymentId": "vtex-payment-id",
  "transactionId": "order-id",
  "value": 100.00,
  "currency": "BRL",
  "miniCart": {
    "buyer": {
      "document": "12345678901",
      "firstName": "Maria",
      "lastName": "Silva"
    },
    "customData": {
      "customApps": [
        {
          "id": "splitsimulation",
          "fields": {
            "splitProfitPct": "75",
            "splitDiscountPct": "25"
          }
        },
        {
          "id": "retailers",
          "fields": {
            "consultant": "{\"monitfyConsultantId\":\"uuid\"}"
          }
        }
      ]
    }
  }
}
```

**Output:**
```json
{
  "paymentId": "vtex-payment-id",
  "tid": "braspag-payment-id",
  "status": "pending",
  "code": "12",
  "message": "PIX payment created successfully",
  "paymentAppData": {
    "appName": "vtex-payment-app",
    "payload": "{\"code\":\"00020101021226990014br.gov.bcb.pix...\",\"qrCodeBase64Image\":\"iVBORw0KGgo...\"}"
  },
  "delayToCancel": 900000,
  "delayToAutoSettle": 120000
}
```

**Braspag API Call:**
```
POST https://apisandbox.braspag.com.br/v2/sales/
Headers:
  MerchantId: {merchantId}
  MerchantKey: {merchantKey}
  
Body: {
  "MerchantOrderId": "order-id",
  "Customer": {
    "Name": "Maria Silva",
    "Identity": "12345678901",
    "IdentityType": "CPF"
  },
  "Payment": {
    "Type": "Pix",
    "Amount": 10000,
    "Provider": "Braspag",
    "SplitPayments": [
      {
        "SubordinateMerchantId": "consultant-uuid",
        "Amount": 7500,
        "Fares": {
          "Mdr": 50.0,
          "Fee": 100
        }
      },
      {
        "SubordinateMerchantId": "marketplace-uuid",
        "Amount": 2500,
        "Fares": {
          "Mdr": 50.0,
          "Fee": 100
        }
      }
    ]
  }
}
```

---

### 2. **Notificação (Webhook)**

**Endpoint VTEX:** `POST /_v/braspag-pix-connector/v0/notifications`

**Input (Braspag):**
```json
{
  "PaymentId": "braspag-payment-id",
  "ChangeType": 1,
  "Status": 2,
  "MerchantOrderId": "order-id",
  "Amount": 10000
}
```

**ChangeTypes:**
- `1`: PaymentStatusChange
- `2`: FraudAnalysisChange
- `3`: Chargeback

**Processamento:**
1. Valida PaymentId
2. Busca dados em VBase
3. Atualiza status
4. Se Status = 2 (Paid):
   - Forward para Store Services
   - Registra split executado

**Output:**
```json
{
  "message": "Notification processed successfully"
}
```

---

### 3. **Cancelamento (Cancel)**

**Endpoint VTEX:** `POST /_v/api/marykay.braspag-pix-connector/payments/{paymentId}/cancellations`

**Input:**
```json
{
  "paymentId": "vtex-payment-id",
  "value": 100.00,
  "requestId": "cancellation-id"
}
```

**Output (Aprovado):**
```json
{
  "paymentId": "vtex-payment-id",
  "cancellationId": "braspag-payment-id",
  "code": "10",
  "message": "PIX payment cancellation requested successfully"
}
```

**Output (Negado):**
```json
{
  "paymentId": "vtex-payment-id",
  "code": "PAID",
  "message": "PIX payment cannot be cancelled - already paid"
}
```

**Regras:**
- ✅ Pode cancelar: Status 1 (Pending) ou 20 (Scheduled)
- ❌ Não pode cancelar: Status 2 (Paid), 10 (Voided), 13 (Aborted)

---

### 4. **Liquidação (Settlement)**

**Endpoint VTEX:** `POST /_v/api/marykay.braspag-pix-connector/payments/{paymentId}/settlements`

**Input:**
```json
{
  "paymentId": "vtex-payment-id",
  "tid": "braspag-payment-id",
  "value": 100.00,
  "requestId": "settlement-id"
}
```

**Braspag API Call:**
```
GET https://apiquerysandbox.braspag.com.br/v2/sales/{paymentId}
Headers:
  MerchantId: {merchantId}
  MerchantKey: {merchantKey}
```

**Output (Aprovado):**
```json
{
  "paymentId": "vtex-payment-id",
  "settleId": "braspag-payment-id",
  "code": "201",
  "message": "PIX payment successfully settled with Mary Kay split processing"
}
```

**Output (Negado):**
```json
{
  "paymentId": "vtex-payment-id",
  "code": "1",
  "message": "PIX payment cannot be settled. Status: Pending"
}
```

**Importante:** O split já foi executado pela Braspag no momento do pagamento (Status 2). O settle apenas confirma para a VTEX.

---

## 🔐 Autenticação OAuth2

### Fluxo de Autenticação Braspag

```
┌──────────────┐                          ┌──────────────┐
│   Connector  │                          │   Braspag    │
│              │                          │   OAuth2     │
└──────┬───────┘                          └──────┬───────┘
       │                                         │
       │ 1. POST /oauth2/token                   │
       │    grant_type=client_credentials        │
       │    scope=*                              │
       │    Authorization: Basic {base64}        │
       ├────────────────────────────────────────>│
       │                                         │
       │                                         │
       │ 2. {                                    │
       │      access_token: "...",               │
       │      token_type: "Bearer",              │
       │      expires_in: 1200                   │
       │    }                                    │
       │<────────────────────────────────────────┤
       │                                         │
       │ 3. Cache token                          │
       │    (renovar antes de expirar)           │
       │                                         │
       │ 4. Use token em requests                │
       │    Authorization: Bearer {token}        │
       ├────────────────────────────────────────>│
       │                                         │
```

**Implementação:**

```typescript
// clients/braspag/authenticator.ts

class BraspagAuthenticator {
  private accessToken: string | null = null
  private tokenExpiry: Date | null = null

  async getAccessToken(): Promise<string> {
    // Se token existe e não expirou, retorna
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return this.accessToken
    }

    // Solicita novo token
    const credentials = Buffer.from(
      `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
    ).toString('base64')

    const response = await this.http.post('/oauth2/token', {
      grant_type: 'client_credentials',
      scope: '*'
    }, {
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    this.accessToken = response.access_token
    this.tokenExpiry = new Date(Date.now() + (response.expires_in * 1000) - 60000) // 1min buffer

    return this.accessToken
  }
}
```

---

## 💾 Persistência de Dados (VBase)

### Buckets Utilizados

#### 1. **braspag-payments**

**Key:** `{PaymentId}` (Braspag)

**Estrutura:**
```typescript
interface StoredBraspagPayment {
  pixPaymentId: string          // ID Braspag
  braspagTransactionId?: string // TID Braspag
  merchantOrderId: string        // Order ID VTEX
  status?: number                // Status code
  type: 'pix'                    // Tipo de pagamento
  amount?: number                // Valor em centavos
  lastUpdated?: string           // ISO timestamp
}
```

**Operações:**
```typescript
// Salvar
await vbase.saveJSON('braspag-payments', paymentId, data)

// Buscar
const payment = await vbase.getJSON<StoredBraspagPayment>(
  'braspag-payments', 
  paymentId, 
  true
)
```

#### 2. **authorizations**

**Key:** `{paymentId}` (VTEX)

**Estrutura:**
```typescript
interface AuthorizationResponse {
  paymentId: string
  tid: string
  status: string
  code: string
  message: string
  paymentAppData?: {
    appName: string
    payload: string
  }
  delayToCancel?: number
  delayToAutoSettle?: number
}
```

---

## 🎨 Payment App - Interface

### Componentes e Estados

```
┌────────────────────────────────────────────────────────┐
│                    PixPayment                          │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │            PaymentTimer                          │ │
│  │      Tempo restante: 01:59:45                    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │         PaymentStatus                            │ │
│  │    ⏳ Aguardando pagamento                        │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │        QRCodeDisplay                             │ │
│  │                                                  │ │
│  │         ┌────────────────┐                       │ │
│  │         │                │                       │ │
│  │         │   QR CODE      │                       │ │
│  │         │   IMAGE        │                       │ │
│  │         │                │                       │ │
│  │         └────────────────┘                       │ │
│  │                                                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  Ou copie o código PIX:                               │
│  ┌──────────────────────────────────────────────────┐ │
│  │ 00020101021226990014br.gov.bcb.pix2577qrcodes... │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │              CopyButton                          │ │
│  │         📋 Copiar código PIX                      │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │       PaymentInstructions                        │ │
│  │                                                  │ │
│  │  1. Abra o app do seu banco                      │ │
│  │  2. Escolha pagar com PIX                        │ │
│  │  3. Escaneie o QR Code ou cole o código         │ │
│  │  4. Confirme as informações                      │ │
│  │  5. Finalize o pagamento                         │ │
│  │                                                  │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Polling de Status

```typescript
// Hook: usePaymentStatus

const POLLING_INTERVAL = 5000 // 5 segundos
const MAX_RETRIES = 360 // 30 minutos

useEffect(() => {
  const interval = setInterval(async () => {
    if (status === 'paid' || status === 'expired') {
      clearInterval(interval)
      return
    }

    const response = await fetch(`/api/payment-status/${transactionId}`)
    const data = await response.json()
    
    setStatus(data.status)
  }, POLLING_INTERVAL)

  return () => clearInterval(interval)
}, [status])
```

---

## 🧪 Cenários de Teste

### Cenário 1: Pagamento Bem-Sucedido

```
1. authorize() → Status 12 (PendingAuthorization)
2. Cliente paga PIX
3. Braspag executa split automaticamente
4. Webhook → Status 2 (Paid)
5. Polling detecta status = paid
6. settle() → Aprovado
7. Pedido finalizado
```

**Logs esperados:**
```
[INFO] CREATING_PIX_SALE
[INFO] PIX_SALE_CREATION_SUCCESS
[INFO] BRASPAG_NOTIFICATION_RECEIVED
[INFO] PAYMENT_STATUS_CHANGED → 2
[INFO] SPLIT_EXECUTED_BY_BRASPAG
[INFO] VTEX_SETTLEMENT_APPROVED
```

### Cenário 2: Cancelamento Antes do Pagamento

```
1. authorize() → Status 12
2. Cliente não paga
3. cancel() → Status 10 (Voided)
4. QR Code inválido
```

**Logs esperados:**
```
[INFO] CREATING_PIX_SALE
[INFO] PIX_CANCELLATION_REQUESTED
[INFO] PIX_CANCELLATION_APPROVED
```

### Cenário 3: Expiração do QR Code

```
1. authorize() → Status 12
2. Cliente não paga em 2 horas
3. QR Code expira automaticamente
4. Status permanece 12 (não pago)
```

**Comportamento Payment App:**
- Timer chega a 00:00:00
- QR Code fica com overlay "Expirado"
- Botão copiar desabilitado

### Cenário 4: Tentativa de Cancelamento Após Pagamento

```
1. authorize() → Status 12
2. Cliente paga → Status 2
3. cancel() → NEGADO
```

**Response:**
```json
{
  "code": "PAID",
  "message": "PIX payment cannot be cancelled - already paid"
}
```

---

## 📊 Métricas e KPIs

### Métricas de Performance

| Métrica | Target | Crítico |
|---------|--------|---------|
| Tempo de autorização | < 2s | > 5s |
| Tempo de webhook | < 30s | > 60s |
| Taxa de sucesso | > 99% | < 95% |
| Uptime | > 99.9% | < 99% |

### Métricas de Negócio

| Métrica | Descrição |
|---------|-----------|
| Taxa de conversão PIX | % de QR Codes que resultam em pagamento |
| Tempo médio de pagamento | Tempo entre geração do QR e confirmação |
| Taxa de expiração | % de QR Codes que expiram sem pagamento |
| Taxa de cancelamento | % de transações canceladas |

### Métricas de Split

| Métrica | Descrição |
|---------|-----------|
| Total split consultora | Valor total destinado às consultoras |
| Total split marketplace | Valor total destinado ao marketplace |
| % médio consultora | Percentual médio de split consultora |
| Erros de split | Quantidade de erros no split |

---

## 🚨 Troubleshooting

### Problema 1: QR Code não renderiza

**Sintoma:** Payment App não exibe QR Code

**Possíveis causas:**
- `paymentAppData.payload` inválido
- Base64 corrompido
- Parse JSON falhou

**Solução:**
```typescript
// Validar payload
try {
  const data = JSON.parse(appPayload)
  if (!data.qrCodeBase64Image || !data.code) {
    throw new Error('Invalid payment data')
  }
} catch (err) {
  console.error('Failed to parse payment data:', err)
}
```

### Problema 2: Webhook não recebido

**Sintoma:** Status não atualiza após pagamento

**Possíveis causas:**
- URL webhook incorreta
- Firewall bloqueando Braspag
- Erro no processamento

**Solução:**
1. Verificar URL configurada na Braspag
2. Testar endpoint manualmente
3. Verificar logs Datadog

### Problema 3: Split não executado

**Sintoma:** Valor total vai para um único merchant

**Possíveis causas:**
- Merchant IDs incorretos
- SplitPayments não enviado
- Erro na Braspag

**Solução:**
1. Validar Merchant IDs
2. Verificar payload enviado
3. Consultar logs Braspag

---

## 📚 Referências Rápidas

### URLs Braspag

- **Sandbox API:** https://apisandbox.braspag.com.br
- **Sandbox Query:** https://apiquerysandbox.braspag.com.br
- **Sandbox OAuth:** https://authsandbox.braspag.com.br
- **Production API:** https://api.braspag.com.br
- **Production Query:** https://apiquery.braspag.com.br
- **Production OAuth:** https://auth.braspag.com.br

### URLs VTEX

- **Admin:** https://{account}.myvtex.com/admin
- **Checkout:** https://{account}.myvtex.com/checkout
- **Gateway:** https://{account}.myvtex.com/admin/pci-gateway

### Documentação

- [Braspag PIX](https://docs.cielo.com.br/split/reference/criar-qr-code-pix-2)
- [VTEX PPF](https://developers.vtex.com/docs/guides/payments-integration-payment-provider-framework)
- [VTEX Payment App](https://developers.vtex.com/docs/guides/payments-integration-payment-app)

---

**Documento completo e pronto para referência! 🚀**

