# Mary Kay Braspag Pix Connector - Configuração Completa

## Visão Geral

O **Mary Kay Braspag Pix Connector** é um Payment Provider Protocol (PPP) implementado em VTEX IO que integra pagamentos Pix com split transacional via Braspag. Este conector permite que a Mary Kay processe pagamentos Pix com divisão automática entre marketplace (Mary Kay) e consultoras, seguindo a mesma lógica de comissões utilizada para cartões de crédito.

## Arquitetura

### Componentes Principais

1. **Conector de Pagamento (PPP)**: Implementa as operações padrão do Payment Provider Framework
2. **Cliente Braspag**: Gerencia autenticação OAuth2 e operações Pix
3. **Sistema de Logging Datadog**: Monitoramento e observabilidade completa
4. **Integração Store Services**: Utiliza o simulador de split existente
5. **Integração Gift Cards**: Processa reembolsos via vouchers VTEX
6. **Webhook Handler**: Recebe notificações de status da Braspag

### Fluxo de Pagamento

```
Checkout → Authorize → Create Pix QR → Pending → Webhook → Split Processing → Completed
```

## Configuração do Ambiente

### 1. Configuração da VTEX

#### 1.1 Instalação do App

```bash
# Link do app no workspace de desenvolvimento
vtex link

# Publicação para produção
vtex publish
```

#### 1.2 Configuração do Payment Provider

Acesse o **VTEX Admin** → **Settings** → **Payment** → **Payment Providers** e configure:

**Configurações Básicas:**
- **Name**: `Braspag Pix Connector`
- **Implementation**: `marykay.braspag-pix-connector@1.x`
- **Payment Methods**: `Pix` (com `allowsSplit: "onAuthorize"`)

**Custom Fields:**
```json
{
  "merchantId": "string",
  "merchantKey": "string", 
  "clientSecret": "string"
}
```

### 2. Configuração da Braspag

#### 2.1 Credenciais de Produção

**Merchant ID**: ID do estabelecimento na Braspag
**Merchant Key**: Chave de autenticação do estabelecimento
**Client Secret**: Segredo do cliente OAuth2

#### 2.2 Credenciais de Sandbox

Para testes, utilize as credenciais do ambiente sandbox da Braspag:
- **Merchant ID**: ID de teste fornecido pela Braspag
- **Merchant Key**: Chave de teste
- **Client Secret**: Segredo de teste

#### 2.3 Configuração de Split

Configure na Braspag:
- **Subordinate Merchant IDs**: IDs das consultoras no sistema Braspag
- **Master Merchant ID**: ID da Mary Kay (marketplace)
- **Split Rules**: Configuração de MDR e taxas por consultora

### 3. Configuração do Store Services

#### 3.1 Dependências

O conector depende do app `marykay.store-services` para:
- Simulação de split antes da autorização
- Processamento de notificações de pagamento
- Orquestração do split pós-pagamento

**Configuração:**
```json
{
  "braspagMerchantId": "string",
  "braspagAccessToken": "string",
  "notifyTargetWorkspace": "string"
}
```

#### 3.2 Endpoints Utilizados

- `POST /_v/split/simulate`: Simulação de comissões
- `POST /_v/notifications/braspag`: Recebimento de notificações

### 4. Configuração do Gift Cards Integration

#### 4.1 Dependências

O conector utiliza o app `marykay.giftcards-integration` para:
- Criação de vouchers de reembolso
- Gestão de gift cards existentes
- Rastreamento de transações

**Configuração:**
```json
{
  "giftCardExpiryYears": 1,
  "defaultCurrency": "BRL",
  "defaultCountry": "BRA"
}
```

#### 4.2 Endpoints Utilizados

- `POST /_v/refund`: Processamento de reembolsos

## Configuração Detalhada

### 1. Configuração do Frontend

#### 1.1 Checkout

Para utilizar o conector no checkout, configure o `orderForm`:

```typescript
// Exemplo de configuração no checkout
const paymentData = {
  paymentMethod: 'Pix',
  paymentSystem: 'marykay.braspag-pix-connector',
  customFields: {
    monitfyConsultantId: 'consultant-id-from-monitfy',
    orderFormId: 'order-form-id'
  }
}
```

#### 1.2 Simulação Prévia

Antes de finalizar o pedido, execute a simulação:

```typescript
// Chamada para simulação de split
const simulation = await fetch('/_v/split/simulate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    monitfyConsultantId: 'consultant-id',
    orderFormId: 'order-form-id'
  })
})

const { splitProfitPct, splitDiscountPct } = await simulation.json()
```

### 2. Configuração de Webhooks

#### 2.1 Braspag Webhook

Configure na Braspag o webhook para notificações:

**URL**: `https://{account}.myvtex.com/_v/payment-provider/braspag-pix-connector/inbound-request/notification`

**Eventos**: 
- `TransactionStatus` (mudanças de status do Pix)

#### 2.2 VTEX Webhook

O conector encaminha notificações para o store-services:

**URL**: `https://{account}.myvtex.com/_v/notifications/braspag`

### 3. Configuração de Políticas de Rede

#### 3.1 Manifest.json

O app já inclui as políticas necessárias:

```json
{
  "policies": [
    {
      "name": "outbound-access",
      "attrs": {
        "host": "api.braspag.com.br"
      }
    },
    {
      "name": "outbound-access", 
      "attrs": {
        "host": "apisandbox.braspag.com.br"
      }
    },
    {
      "name": "outbound-access",
      "attrs": {
        "host": "auth.braspag.com.br"
      }
    },
    {
      "name": "outbound-access",
      "attrs": {
        "host": "authsandbox.braspag.com.br"
      }
    },
    {
      "name": "outbound-access",
      "attrs": {
        "host": "*.myvtex.com"
      }
    }
  ]
}
```

## Configuração por Ambiente

### Ambiente de Desenvolvimento

```bash
# Workspace de desenvolvimento
vtex use dev-workspace

# Configuração local
vtex env set LOCAL

# Credenciais de sandbox
MERCHANT_ID=sandbox-merchant-id
MERCHANT_KEY=sandbox-merchant-key  
CLIENT_SECRET=sandbox-client-secret
```

### Ambiente de Homologação

```bash
# Workspace de homologação
vtex use homolog-workspace

# Configuração de homologação
vtex env set HOMOLOG

# Credenciais de sandbox (mesmas do desenvolvimento)
```

### Ambiente de Produção

```bash
# Workspace master
vtex use master

# Configuração de produção
vtex env set PROD

# Credenciais de produção
MERCHANT_ID=production-merchant-id
MERCHANT_KEY=production-merchant-key
CLIENT_SECRET=production-client-secret
```

## Configuração de Monitoramento

### 1. Sistema de Logging Datadog

O conector implementa um sistema completo de logging integrado ao Datadog para observabilidade avançada:

#### 1.1 Configuração do Datadog

**Estrutura de Logs:**
```typescript
// Logger automático injetado via middleware
ctx.logger.info('OPERATION_SUCCESS', {
  paymentId: 'payment-123',
  amount: 10000,
  metadata: { /* contexto adicional */ }
})

ctx.logger.warn('VALIDATION_WARNING', {
  field: 'consultantId',
  value: 'invalid-consultant'
})

ctx.logger.error('OPERATION_FAILED', {
  operation: 'createPixSale',
  error: error.message,
  context: { /* dados do erro */ }
})
```

#### 1.2 Tipos de Logs Implementados

**Logs de Autorização (INFO/ERROR):**
- `CREATING_PIX_SALE`: Início da criação de venda Pix
- `PIX_SALE_CREATION_FAILED`: Falha na criação
- `PIX_QR_STRING_MISSING`: QR Code não gerado
- `PIX_AUTHORIZATION_SUCCESS`: Autorização bem-sucedida

**Logs de Split (INFO/ERROR):**
- `SPLIT_SIMULATION_SUCCESS`: Simulação de split realizada
- `SPLIT_SIMULATION_ERROR`: Falha na simulação

**Logs de Reembolso (INFO/WARN/ERROR):**
- `REFUND_DENIED_MISSING_DATA`: Dados insuficientes para reembolso
- `REFUND_SUCCESS`: Reembolso processado
- `REFUND_FAILED`: Falha no processamento

**Logs de Webhook (INFO/ERROR):**
- `BRASPAG_NOTIFICATION_RECEIVED`: Notificação recebida
- `BRASPAG_NOTIFICATION_FORWARDED`: Notificação encaminhada
- `BRASPAG_NOTIFICATION_ERROR`: Erro no processamento

**Logs do Cliente Braspag (INFO/ERROR):**
- `BRASPAG_AUTHENTICATION_FAILED`: Falha na autenticação
- `BRASPAG_CREATE_PIX_SALE_REQUEST`: Requisição de criação
- `BRASPAG_CREATE_PIX_SALE_SUCCESS`: Criação bem-sucedida
- `BRASPAG_CREATE_PIX_SALE_FAILED`: Falha na criação
- `BRASPAG_VOID_PIX_PAYMENT_*`: Logs de cancelamento

**Logs de Serviços (INFO/ERROR):**
- `STORE_SERVICES_SIMULATE_SPLIT_*`: Operações de simulação
- `STORE_SERVICES_FORWARD_NOTIFICATION_*`: Encaminhamento de notificações
- `GIFTCARDS_REFUND_*`: Operações de reembolso

**Logs de Sistema (INFO/ERROR):**
- `HEALTH_CHECK_REQUEST`: Verificações de saúde
- `CAPTURED_ERROR`: Erros capturados pelo middleware

#### 1.3 Configuração de Contexto

```typescript
// Contexto automático adicionado a todos os logs
{
  source: 'marykay.braspag-pix-connector',
  env: 'production', // ou 'sandbox'
  version: '1.x.x',
  hostname: 'vtex-io-hostname',
  service: 'payment-provider',
  operationId: 'unique-operation-id',
  account: 'vtex-account',
  trace_id: 'distributed-tracing-id',
  http: {
    url: 'request-url',
    method: 'HTTP-method',
    status_code: 'response-code'
  }
}
```

#### 1.4 Middleware de Logging

```typescript
// Injeção automática do logger
import { injectLogger } from './tools/datadog/log/inject-logger'
import { errorMiddleware } from './tools/method/error-middleware'

// Configuração no service principal
service.use(injectLogger)  // Injeta logger em ctx.logger
service.use(errorMiddleware) // Captura erros globais
```

### 2. Métricas e Dashboards Datadog

#### 2.1 Métricas de Performance
- **Taxa de Sucesso**: `PIX_AUTHORIZATION_SUCCESS` vs `PIX_SALE_CREATION_FAILED`
- **Tempo de Resposta**: Latência das operações Braspag
- **Split Simulation**: Taxa de sucesso/falha da simulação
- **Webhook Processing**: Tempo de processamento de notificações

#### 2.2 Métricas de Erro
- **Authentication Failures**: `BRASPAG_AUTHENTICATION_FAILED`
- **Payment Failures**: `PIX_SALE_CREATION_FAILED`
- **Refund Failures**: `REFUND_FAILED`
- **Notification Errors**: `BRASPAG_NOTIFICATION_ERROR`

#### 2.3 Dashboards Recomendados
```yaml
# Dashboard de Transações
Payment Success Rate: count(PIX_AUTHORIZATION_SUCCESS) / count(CREATING_PIX_SALE)
Average Transaction Value: avg(amount from PIX_AUTHORIZATION_SUCCESS)
Split Success Rate: count(SPLIT_SIMULATION_SUCCESS) / count(split requests)

# Dashboard de Erros
Error Rate by Type: count by error type
Top Error Messages: top 10 error messages
Error Trend: errors over time

# Dashboard de Performance
Response Time P95: 95th percentile response time
Throughput: requests per minute
Error Rate: errors per minute
```

### 3. Alertas Inteligentes

#### 3.1 Alertas Críticos (Imediatos)
```yaml
Braspag Authentication Failure:
  condition: count(BRASPAG_AUTHENTICATION_FAILED) > 5 in 5min
  severity: critical
  action: escalate immediately

Payment Creation Failure Rate:
  condition: rate(PIX_SALE_CREATION_FAILED) > 10% in 10min
  severity: critical
  action: page on-call engineer

Webhook Processing Failure:
  condition: count(BRASPAG_NOTIFICATION_ERROR) > 10 in 5min
  severity: high
  action: notify development team
```

#### 3.2 Alertas de Monitoramento (Não-críticos)
```yaml
Split Simulation Degradation:
  condition: rate(SPLIT_SIMULATION_ERROR) > 5% in 15min
  severity: medium
  action: monitor and investigate

Refund Processing Issues:
  condition: count(REFUND_FAILED) > 3 in 30min
  severity: medium
  action: check gift card integration

Health Check Failures:
  condition: no HEALTH_CHECK_REQUEST in 5min
  severity: low
  action: verify service availability
```

## Configuração de Segurança

### 1. Autenticação

- **OAuth2 Client Credentials**: Utilizado para autenticação com Braspag
- **Bearer Token**: Renovado automaticamente
- **HTTPS**: Todas as comunicações via HTTPS

### 2. Validação de Dados

- Validação de `monitfyConsultantId`
- Verificação de `orderFormId`
- Validação de valores de split
- Verificação de CPF do cliente

### 3. Idempotência

- `paymentId` único por transação
- Persistência em VBase para reembolsos
- Verificação de duplicidade

## Configuração de Testes

### 1. Test Suite VTEX

```bash
# Executar test suite
vtex test:e2e

# Testes específicos
vtex test:e2e --grep "Pix"
```

### 2. Testes de Integração

```typescript
// Exemplo de teste de autorização
const authRequest = {
  paymentId: 'test-payment-id',
  value: 10000,
  recipients: [
    { id: 'seller-id', role: 'seller', amount: 7000 },
    { id: 'marketplace-id', role: 'marketplace', amount: 3000 }
  ],
  miniCart: {
    shippingValue: 0,
    buyer: { document: '12345678901' }
  }
}
```

### 3. Testes de Webhook

```bash
# Simular notificação Braspag
curl -X POST https://{account}.myvtex.com/_v/payment-provider/braspag-pix-connector/inbound-request/notification \
  -H "Content-Type: application/json" \
  -d '{
    "PaymentId": "test-payment-id",
    "ChangeType": "TransactionStatus",
    "Status": 2
  }'
```

## Troubleshooting

### 1. Problemas Comuns

#### Erro de Autenticação Braspag
```
Error: Braspag authentication failed
```
**Solução**: Verificar credenciais no VTEX Admin

#### Falha na Simulação de Split
```
Error: Error simulating split
```
**Solução**: Verificar se `marykay.store-services` está configurado

#### Webhook não Recebido
```
Error: Error forwarding braspag notification
```
**Solução**: Verificar URL do webhook na Braspag

### 2. Logs de Debug com Datadog

#### 2.1 Logs Estruturados para Debug

```typescript
// Logs detalhados já implementados
ctx.logger.info('CREATING_PIX_SALE', {
  merchantOrderId,
  amount,
  splitPaymentsCount: splitPayments.length,
  metadata: {
    consultantId,
    orderFormId,
    customer: authorization.miniCart?.buyer?.document
  }
})

// Logs de erro com contexto completo
ctx.logger.error('BRASPAG_CREATE_PIX_SALE_FAILED', {
  merchantOrderId,
  error: error.message,
  stack: error.stack,
  request: payload,
  response: response || null
})
```

#### 2.2 Filtragem e Busca no Datadog

```bash
# Buscar logs por operação
source:marykay.braspag-pix-connector @message:"PIX_AUTHORIZATION_SUCCESS"

# Buscar logs por payment ID
source:marykay.braspag-pix-connector @content.merchantOrderId:"payment-123"

# Buscar erros específicos
source:marykay.braspag-pix-connector @status:ERROR @content.operation:"createPixSale"

# Buscar por trace ID
source:marykay.braspag-pix-connector @trace_id:"trace-123"
```

#### 2.3 Logs de Tracing Distribuído

```typescript
// Trace ID propagado automaticamente
ctx.logger.info('OPERATION_START', {
  operation: 'authorize',
  traceId: ctx.traceId,
  spanId: ctx.spanId,
  parentSpanId: ctx.parentSpanId
})
```

### 3. Verificação de Status com Datadog

#### 3.1 Status via VTEX CLI
```bash
# Verificar status do app
vtex apps:info marykay.braspag-pix-connector

# Verificar logs locais (desenvolvimento)
vtex logs marykay.braspag-pix-connector
```

#### 3.2 Monitoramento via Datadog
```bash
# Health check endpoint com logging
GET https://{account}.myvtex.com/_v/payment-provider/braspag-pix-connector/health

# Logs automáticos gerados:
# HEALTH_CHECK_REQUEST + HEALTH_CHECK_SUCCESS
```

#### 3.3 Dashboards de Status
```yaml
# Service Health Dashboard
Uptime: percentage based on health checks
Error Rate: errors per total requests
Response Time: average response time
Active Transactions: current processing volume

# Business Metrics Dashboard  
Transaction Volume: payments per hour/day
Revenue Impact: total transaction value
Split Distribution: marketplace vs consultant revenue
Refund Rate: percentage of refunded transactions
```

#### 3.4 SLA Monitoring
```yaml
# SLA Targets
Availability: 99.9% uptime
Response Time: < 2s for 95% of requests
Error Rate: < 0.1% of total transactions
Webhook Processing: < 30s end-to-end
```

## Configuração de Performance

### 1. Timeouts

```typescript
// Timeouts configurados
const BRASPAG_TIMEOUT = 20000 // 20s
const SIMULATION_TIMEOUT = 15000 // 15s
const WEBHOOK_TIMEOUT = 10000 // 10s
```

### 2. Retry Policy

```typescript
// Política de retry
const RETRY_CONFIG = {
  retries: 2,
  backoff: 'exponential',
  jitter: true
}
```

### 3. Cache

- VBase para persistência de dados de autorização
- Cache de tokens OAuth2 (renovação automática)

## Configuração de Compliance

### 1. LGPD

- Dados pessoais criptografados
- Retenção mínima de dados
- Consentimento do usuário

### 2. PCI DSS

- Não armazenamento de dados sensíveis
- Comunicação segura com Braspag
- Logs sem dados sensíveis

### 3. Auditoria

- Logs de todas as transações
- Rastreabilidade completa
- Backup de dados críticos

## Configuração de Backup e Recuperação

### 1. Backup de Configuração

```bash
# Exportar configuração
vtex env get > config-backup.json

# Backup de dados VBase
vtex vbase export authorizations
vtex vbase export pix-auth-data
```

### 2. Recuperação

```bash
# Restaurar configuração
vtex env set < config-backup.json

# Restaurar dados VBase
vtex vbase import authorizations
vtex vbase import pix-auth-data
```

## Configuração de Escalabilidade

### 1. Replicas

```json
{
  "minReplicas": 2,
  "maxReplicas": 10,
  "workers": 4
}
```

### 2. Load Balancing

- Distribuição automática de carga
- Health checks configurados
- Failover automático

### 3. Monitoramento de Recursos

- CPU e memória
- Latência de rede
- Taxa de erro

## Configuração de Manutenção

### 1. Deploy

```bash
# Deploy sem downtime
vtex deploy --production

# Rollback
vtex rollback marykay.braspag-pix-connector
```

### 2. Atualizações

```bash
# Atualizar dependências
vtex update

# Verificar compatibilidade
vtex deps:check
```

### 3. Limpeza

```bash
# Limpar logs antigos
vtex logs:clean

# Limpar cache
vtex cache:clean
```

## Configuração de Suporte

### 1. Contatos

- **Desenvolvimento**: Equipe de desenvolvimento Mary Kay
- **Braspag**: Suporte técnico Braspag
- **VTEX**: Suporte VTEX

### 2. Documentação

- [Documentação Braspag](https://docs.braspag.com.br)
- [Payment Provider Protocol](https://help.vtex.com/en/tutorial/payment-provider-protocol)
- [VTEX IO Documentation](https://developers.vtex.com/docs/guides/vtex-io-documentation-what-is-vtex-io)

### 3. Comunidade

- [VTEX Community](https://community.vtex.com)
- [GitHub Issues](https://github.com/marykay/braspag-pix-connector/issues)

---

## Configuração de Log Retention e Compliance

### 1. Retenção de Logs

```yaml
# Política de retenção Datadog
Production Logs:
  retention: 30 days
  archive: S3 bucket for compliance
  
Error Logs:
  retention: 90 days
  priority: high indexing
  
Audit Logs:
  retention: 7 years (compliance LGPD/PCI)
  encryption: at rest and in transit
```

### 2. Compliance e Auditoria

```typescript
// Logs de auditoria automáticos
ctx.logger.info('PAYMENT_AUDIT_TRAIL', {
  paymentId,
  operation: 'authorize',
  userId: authorization.miniCart?.buyer?.id,
  amount: authorization.value,
  timestamp: new Date().toISOString(),
  ipAddress: ctx.request.ip,
  userAgent: ctx.request.headers['user-agent']
})
```

### 3. Privacidade e Sanitização

```typescript
// Dados sensíveis automaticamente sanitizados
{
  // ✅ Dados permitidos nos logs
  paymentId: 'payment-123',
  amount: 10000,
  status: 'success',
  
  // ❌ Dados automaticamente removidos
  // document: '***.***.***-**',
  // creditCard: '[REDACTED]',
  // password: '[REDACTED]'
}
```

---

**Versão**: 1.1.0  
**Última Atualização**: Janeiro 2025  
**Responsável**: Equipe de Desenvolvimento Mary Kay  
**Sistema de Logging**: Datadog Integration v1.0
