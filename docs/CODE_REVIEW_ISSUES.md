# 🔍 Code Review - Problemas Identificados

## 📊 Sumário

| Categoria | Quantidade | Prioridade |
|-----------|------------|------------|
| **Código Comentado** | 1 | 🟢 Baixa |
| **Imports Não Utilizados** | 3 | 🟡 Média |
| **Código Duplicado** | 2 | 🔴 Alta |
| **Lógica Redundante** | 3 | 🟡 Média |
| **Tipos `any`** | 5 | 🔴 Alta |
| **Código Não Utilizado** | 1 arquivo | 🟡 Média |
| **Hardcoded Values** | 3 | 🔴 Alta |

---

## 🔴 ALTA PRIORIDADE

### 1. Código Duplicado: VBase Adapter

**Arquivo:** `node/connector.ts` (linhas 233-240)

**Problema:** Criação de adapter VBase duplicado

```typescript
// Em connector.ts - método inbound()
const vbaseClient = {
  getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
    this.context.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
  saveJSON: async (bucket: string, key: string, data: unknown) => {
    await this.context.clients.vbase.saveJSON(bucket, key, data)
  },
}
```

**Também em:** `node/middlewares/notifications/index.ts` (linhas 36-42)

```typescript
const notificationContext: NotificationContext = {
  status: ctx.status || 200,
  body: ctx.body,
  clients: {
    vbase: {
      getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
        ctx.clients.vbase.getJSON<T>(bucket, key, nullIfNotFound),
      saveJSON: async (bucket: string, key: string, data: unknown) => {
        await ctx.clients.vbase.saveJSON(bucket, key, data)
      },
    },
    // ...
  },
  // ...
}
```

**Solução:** Criar função helper reutilizável

```typescript
// node/utils/vbase-adapter.ts
export const createVBaseAdapter = (vbase: any) => ({
  getJSON: <T>(bucket: string, key: string, nullIfNotFound?: boolean) =>
    vbase.getJSON<T>(bucket, key, nullIfNotFound),
  saveJSON: async (bucket: string, key: string, data: unknown) => {
    await vbase.saveJSON(bucket, key, data)
  },
})
```

---

### 2. Uso Excessivo de `any`

**Problema:** Múltiplos usos de tipo `any` que removem type-safety

#### Arquivo: `node/connector.ts`

```typescript
// Linha 62-66
private readonly pixAuthService: any       // ❌ any
private readonly pixOpsService: any        // ❌ any
private readonly webhookService: any       // ❌ any

// Linha 68
constructor(context: any) { }              // ❌ any

// Linha 37
const persistAuthorizationResponse = async (
  vbase: any,                              // ❌ any
  resp: AuthorizationResponse
)
```

**Solução:** Criar tipos apropriados

```typescript
// node/types/services.ts
export interface PixAuthorizationService {
  authorizePixPayment(authorization: AuthorizationRequest): Promise<AuthorizationResponse>
}

export interface PixOperationsService {
  cancelPayment(cancellation: CancellationRequest): Promise<CancellationResponse>
  settlePayment(settlement: SettlementRequest): Promise<SettlementResponse>
}

export interface WebhookInboundService {
  processWebhook(request: WebhookRequest, vbaseClient: VBaseClient): Promise<WebhookResponse>
}

export interface VBaseClient {
  getJSON<T>(bucket: string, key: string, nullIfNotFound?: boolean): Promise<T>
  saveJSON(bucket: string, key: string, data: unknown): Promise<void>
}
```

```typescript
// node/connector.ts
private readonly pixAuthService: PixAuthorizationService
private readonly pixOpsService: PixOperationsService
private readonly webhookService: WebhookInboundService

constructor(context: Context<Clients, PaymentProviderState>) {
  super(context)
  // ...
}
```

---

### 3. Hardcoded Values

#### 3.1 Credenciais de Sandbox

**Arquivo:** `node/clients/braspag/index.ts` (linhas 27-31)

```typescript
const credentials: BraspagCredentials = context.settings || {
  merchantId: '85c49198-837a-423c-89d0-9087b5d16d49',    // ❌ Hardcoded
  clientSecret: 'Dbmrh40sM/ne/3fVmLVkicGdndGY5zFgUNnMJ9seBMM=',  // ❌ Hardcoded
  merchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',      // ❌ Hardcoded
}
```

**Solução:** Remover fallback completamente

```typescript
const credentials: BraspagCredentials = context.settings

if (!credentials?.merchantId || !credentials?.merchantKey || !credentials?.clientSecret) {
  throw new Error('Missing required Braspag credentials in settings')
}
```

#### 3.2 Hardcoded Headers na API Call

**Arquivo:** `node/clients/braspag/index.ts` (linhas 78-81)

```typescript
headers: {
  MerchantId: '85C49198-837A-423C-89D0-9087B5D16D49',  // ❌ Hardcoded
  MerchantKey: 'pAjaC9SZSuL6r3nzUohxjXvbsg5TDEkXPTTYTogP',  // ❌ Hardcoded
}
```

**Solução:** Usar credentials configuradas

```typescript
headers: {
  MerchantId: this.config.credentials.merchantId,
  MerchantKey: this.config.credentials.merchantKey,
}
```

#### 3.3 Mock CustomData

**Arquivo:** `node/services/authorization/index.ts` (linha 42-43)

```typescript
// TODO USAR CUSTOMDATA DE PRODUÇÃO
const mockCustomDataTyped = mockCustomData as any  // ❌ Mock hardcoded
```

**Solução:** Usar dados reais

```typescript
const customData = authorization.miniCart?.customData as MaryKayCustomData

if (!customData) {
  throw new Error('Missing custom data in authorization request')
}

const splitApp = customData.customApps?.find(
  (app: any) => app.id === 'splitsimulation'
)
```

---

## 🟡 MÉDIA PRIORIDADE

### 4. Lógica Redundante

#### 4.1 Duplicação na Validação de Notificação

**Arquivo:** `node/services/braspag-notification-handler/index.ts` (linha 13-16)

```typescript
public canHandle(notification: unknown): notification is BraspagNotification {
  const canHandle = this.isBraspagNotification(notification)  // ❌ Redundante
  return canHandle
}
```

**Solução:** Retornar diretamente

```typescript
public canHandle(notification: unknown): notification is BraspagNotification {
  return this.isBraspagNotification(notification)
}
```

#### 4.2 Atualização VBase Repetida

**Arquivos:** 
- `node/services/braspag-notification-handler/index.ts` (linhas 255-277)
- `node/services/braspag-notification-handler/index.ts` (linhas 280-303)

**Problema:** Lógica de atualização de VBase duplicada em `handleFraudAnalysisChange` e `handleChargeback`

**Solução:** Criar método reutilizável

```typescript
private async updatePaymentInStorage(
  paymentId: string,
  storedPayment: StoredBraspagPayment,
  updates: Partial<StoredBraspagPayment>,
  context: NotificationContext
): Promise<void> {
  const updatedPayment: StoredBraspagPayment = {
    ...storedPayment,
    ...updates,
    lastUpdated: new Date().toISOString(),
  }

  await context.clients.vbase.saveJSON(
    'braspag-payments',
    paymentId,
    updatedPayment
  )
}

// Uso:
private async handleFraudAnalysisChange(params: {...}): Promise<void> {
  this.logger.info('BRASPAG: Fraud analysis changed', { ... })
  
  await this.updatePaymentInStorage(
    params.paymentId,
    params.storedPayment,
    {}, // sem updates extras
    params.context
  )
}

private async handleChargeback(params: {...}): Promise<void> {
  this.logger.info('BRASPAG: Chargeback notification', { ... })
  
  await this.updatePaymentInStorage(
    params.paymentId,
    params.storedPayment,
    { status: params.status },
    params.context
  )
}
```

#### 4.3 Verificação Dupla de Payment Method

**Arquivo:** `node/connector.ts` (linhas 216-221)

```typescript
private isPixPayment(authorization: AuthorizationRequest): boolean {
  return (
    (authorization as any).paymentMethod === 'Pix' ||           // ❌ Verifica duas vezes
    (authorization as any).miniCart?.paymentMethod === 'Pix'    // ❌ a mesma coisa
  )
}
```

**Análise:** Esta lógica pode ser ambígua. Verificar se realmente é necessário checar ambos.

**Solução sugerida:**

```typescript
private isPixPayment(authorization: AuthorizationRequest): boolean {
  const auth = authorization as any
  return auth.paymentMethod === 'Pix' || auth.miniCart?.paymentMethod === 'Pix'
}
```

Ou, se apenas um é relevante:

```typescript
private isPixPayment(authorization: AuthorizationRequest): boolean {
  const paymentMethod = (authorization as any).paymentMethod || 
                       (authorization as any).miniCart?.paymentMethod
  return paymentMethod === 'Pix'
}
```

---

### 5. Imports Não Utilizados

#### 5.1 Em `node/connector.ts`

```typescript
import { randomString } from './utils'  // ✅ USADO (linha 133)
import { executeAuthorization } from './flow'  // ✅ USADO (linha 190)
```

**Status:** ✅ Todos os imports estão sendo utilizados

#### 5.2 Em `node/flow.ts`

```typescript
import {
  isBankInvoiceAuthorization,   // ✅ USADO
  isCardAuthorization,           // ✅ USADO
  isTokenizedCard,               // ✅ USADO
  AuthorizationRequest,          // ✅ USADO
  AuthorizationResponse,         // ✅ USADO
  Authorizations,                // ✅ USADO
} from '@vtex/payment-provider'
```

**Status:** ✅ Todos utilizados

---

### 6. Código Não Utilizado

#### 6.1 Arquivo `node/flow.ts` - TODO O ARQUIVO

**Problema:** Este arquivo inteiro (`flow.ts`) parece ser usado apenas para **Test Suite**, mas não para produção PIX.

**Evidência:**

```typescript
// node/connector.ts - linha 121-125
if (this.isTestSuite) {
  return this.handleTestSuiteAuthorization(authorization)  // Usa flow.ts
}

return this.handleProductionAuthorization(authorization)   // Não usa flow.ts
```

```typescript
// node/connector.ts - linha 190
return executeAuthorization(authorization, response =>
  this.saveAndRetry(authorization, response)
)
```

**Análise:**
- `flow.ts` é usado **APENAS** para Test Suite
- Em produção, usa `pixAuthService.authorizePixPayment()`

**Recomendação:**
- Se não for mais necessário para testes: ✅ **PODE REMOVER**
- Se ainda é necessário para homologação VTEX: ⚠️ **MANTER**

**Decisão:** Manter por enquanto, mas adicionar comentário:

```typescript
// node/flow.ts - adicionar no topo:
/**
 * Test Suite Flow Handler
 * 
 * ⚠️ WARNING: This file is ONLY used for VTEX Test Suite validation
 * It is NOT used in production PIX payments
 * 
 * Production flow uses: node/services/authorization/index.ts
 */
```

---

## 🟢 BAIXA PRIORIDADE

### 7. Código Comentado

#### 7.1 Método `getChangeTypeName` Comentado

**Arquivo:** `node/services/braspag-notification-handler/index.ts` (linhas 47-61)

```typescript
// private getChangeTypeName(changeType: number): string {
//   switch (changeType) {
//     case BraspagChangeType.PaymentStatusChange:
//       return 'PaymentStatusChange'
//
//     case BraspagChangeType.FraudAnalysisChange:
//       return 'FraudAnalysisChange'
//
//     case BraspagChangeType.Chargeback:
//       return 'Chargeback'
//
//     default:
//       return `Unknown(${changeType})`
//   }
// }
```

**Solução:** 
- **Opção 1:** Remover completamente se não for usado
- **Opção 2:** Descomentar e usar nos logs para melhor legibilidade

**Recomendação:** ❌ **REMOVER** - Não está sendo usado

---

## 📝 Melhorias Sugeridas

### 1. Criar Types Centralizados

```typescript
// node/types/common.ts
export interface VBaseClient {
  getJSON<T>(bucket: string, key: string, nullIfNotFound?: boolean): Promise<T>
  saveJSON(bucket: string, key: string, data: unknown): Promise<void>
}

export interface PaymentContext {
  clients: {
    vbase: VBaseClient
    storeServices?: StoreServicesClient
  }
}
```

### 2. Extrair Constantes Duplicadas

```typescript
// node/constants/vbase-buckets.ts
export const VBASE_BUCKETS = {
  AUTHORIZATIONS: 'authorizations',
  BRASPAG_PAYMENTS: 'braspag-payments',
} as const
```

### 3. Criar Utility para VBase Adapter

```typescript
// node/utils/vbase-adapter.ts
import { VBaseClient } from '../types/common'

export const createVBaseAdapter = (vbase: any): VBaseClient => ({
  getJSON: <T>(bucket: string, key: string, nullIfNotFound = false) =>
    vbase.getJSON<T>(bucket, key, nullIfNotFound),
  saveJSON: async (bucket: string, key: string, data: unknown) => {
    await vbase.saveJSON(bucket, key, data)
  },
})
```

---

## ✅ Checklist de Refatoração

### Alta Prioridade 🔴
- [ ] Remover hardcoded credentials do fallback
- [ ] Remover hardcoded headers na API call
- [ ] Substituir mock customData por dados reais
- [ ] Adicionar tipos corretos (remover `any`)
- [ ] Criar VBase adapter reutilizável

### Média Prioridade 🟡
- [ ] Simplificar método `canHandle()`
- [ ] Criar método `updatePaymentInStorage()` reutilizável
- [ ] Revisar lógica de verificação PIX payment
- [ ] Adicionar comentário no `flow.ts` sobre uso

### Baixa Prioridade 🟢
- [ ] Remover método `getChangeTypeName` comentado
- [ ] Criar types centralizados
- [ ] Extrair constantes de buckets VBase

---

## 📊 Impacto Estimado

| Refatoração | Linhas Reduzidas | Tempo Estimado |
|-------------|------------------|----------------|
| Remover hardcoded values | ~10 linhas | 30 min |
| Adicionar tipos corretos | ~50 linhas | 2 horas |
| VBase adapter helper | -30 linhas | 1 hora |
| Método storage reutilizável | -20 linhas | 30 min |
| Remover código comentado | -15 linhas | 5 min |
| **TOTAL** | **~125 linhas** | **~4 horas** |

---

## 🎯 Priorização Recomendada

### Sprint 1 (Antes de Produção)
1. ✅ Remover hardcoded credentials
2. ✅ Substituir mock customData
3. ✅ Adicionar tipos corretos

### Sprint 2 (Pós-Produção)
4. ✅ Criar utilities reutilizáveis
5. ✅ Refatorar métodos duplicados
6. ✅ Limpar código comentado

---

**Documento gerado em:** $(date +%Y-%m-%d)  
**Total de issues:** 14  
**Issues críticos:** 3  
**Status:** Pronto para refatoração


