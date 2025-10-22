# ⚡ Quick Reference - Mary Kay Braspag PIX Connector

## 🎯 Resumo Executivo

### Status do Projeto
- ✅ **Conector PPF**: Implementado e funcional
- ✅ **Autorização**: Testada com sucesso (QR Code gerado)
- ⏳ **Notificação**: Implementada, aguardando teste real
- ⏳ **Cancelamento**: Implementado, aguardando teste
- ⏳ **Liquidação**: Implementada, aguardando teste
- 🔄 **Payment App**: Precisa ser desenvolvido

### Arquivos Principais
```
node/connector.ts              → Conector principal (PPF)
node/services/authorization/   → Lógica de autorização PIX
node/services/operations/      → Cancel e Settle
node/clients/braspag/          → Cliente API Braspag
node/adapters/                 → Transformação de dados
```

---

## 🚀 Comandos Rápidos

### Desenvolvimento
```bash
# Link app
vtex link

# Ver logs
vtex logs --all

# Deploy
vtex publish

# Instalar
vtex install marykay.braspag-pix-connector
```

### Testes
```bash
# Testar authorization
curl -X POST https://{account}.myvtex.com/_v/api/payment-provider/payments \
  -H "Content-Type: application/json" \
  -d '{
    "paymentId": "test-123",
    "value": 100.00,
    "transactionId": "order-123",
    "miniCart": {
      "buyer": {
        "document": "12345678901",
        "firstName": "Maria",
        "lastName": "Silva"
      }
    }
  }'

# Simular webhook
curl -X POST https://{account}.myvtex.com/_v/braspag-pix-connector/v0/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "PaymentId": "payment-id",
    "ChangeType": 1,
    "Status": 2,
    "MerchantOrderId": "order-123",
    "Amount": 10000
  }'
```

---

## 📋 Checklist Completo

### ✅ Fase 1: Connector (COMPLETO)
- [x] Implementar `authorize()`
- [x] Implementar `cancel()`
- [x] Implementar `settle()`
- [x] Implementar `inbound()` (webhook)
- [x] Cliente Braspag
- [x] Adapters de dados
- [x] Persistência VBase
- [x] Logging Datadog
- [x] Split transacional

### ⏳ Fase 2: Testes (EM ANDAMENTO)
- [x] Teste authorization (QR Code gerado)
- [ ] Teste pagamento real PIX
- [ ] Teste recebimento webhook
- [ ] Teste cancelamento
- [ ] Teste liquidação
- [ ] Validar split executado

### 🔄 Fase 3: Payment App (PRÓXIMO)
- [ ] Criar projeto React
- [ ] Componente principal PixPayment
- [ ] Exibição QR Code
- [ ] Botão copiar código
- [ ] Timer de expiração
- [ ] Polling de status
- [ ] Instruções de pagamento
- [ ] Estilização
- [ ] Deploy

### 🔧 Fase 4: Correções (IMPORTANTE)
- [ ] ⚠️ Substituir mock customData
- [ ] ⚠️ Remover credenciais hardcoded
- [ ] ⚠️ Validar Merchant IDs
- [ ] Ajustar timeout cancelamento (15min → 2h)
- [ ] Tratamento de erros robusto

### 📊 Fase 5: Produção
- [ ] Credenciais produção
- [ ] Configurar webhooks Braspag
- [ ] Monitoramento Datadog
- [ ] Alertas críticos
- [ ] Documentação final
- [ ] Treinamento equipe

---

## 🔍 Status Codes Braspag

| Code | Nome | Descrição | Ações |
|------|------|-----------|-------|
| 0 | NotFinished | Não finalizado | Cancel |
| 1 | Pending | Pendente | Cancel |
| **2** | **Paid** | **Pago ✅** | **Settle** |
| 3 | Denied | Negado | - |
| 10 | Voided | Cancelado | - |
| 11 | Refunded | Estornado | - |
| 12 | PendingAuth | Aguardando | Cancel |
| 13 | Aborted | Abortado | - |
| 20 | Scheduled | Agendado | Cancel |

---

## 🔄 Fluxo Simplificado

```
1. Cliente finaliza compra → Seleciona PIX
2. authorize() → Gera QR Code (Status 12)
3. Payment App → Renderiza QR Code
4. Cliente paga → Banco processa
5. Braspag → Executa split (75%/25%)
6. Webhook → Notifica VTEX (Status 2)
7. settle() → Confirma pedido
8. Pedido finalizado
```

---

## ⚠️ Pontos Críticos

### 1. CustomData Mock (URGENTE)
**Arquivo:** `node/services/authorization/index.ts:42`
```typescript
// ❌ ATUAL (Mock)
const mockCustomDataTyped = mockCustomData as any

// ✅ CORRETO (Produção)
const customData = authorization.miniCart?.customData
```

### 2. Credenciais Hardcoded
**Arquivo:** `node/clients/braspag/index.ts:28`
```typescript
// ❌ Remover fallback
const credentials: BraspagCredentials = context.settings || {
  merchantId: '85c49198...',  // REMOVER
  // ...
}

// ✅ Usar apenas context.settings
const credentials: BraspagCredentials = context.settings
```

### 3. Merchant IDs Split
**Arquivo:** `node/adapters/braspag-pix-adapter.ts:18`
```typescript
CONSULTANT_MERCHANT_ID: 'E28449FA-1268-42BF-B4D3-313BF447285E',
MARKETPLACE_MERCHANT_ID: '53548187-B270-414B-936E-32EBB2CBBE98',
```
**Ação:** Validar com Braspag

---

## 🎨 Payment App - Estrutura

```
braspag-pix-payment-app/
├── manifest.json
├── react/
│   ├── components/
│   │   ├── PixPayment.tsx          # ⭐ Principal
│   │   ├── QRCodeDisplay.tsx
│   │   ├── CopyButton.tsx
│   │   ├── PaymentTimer.tsx
│   │   └── PaymentInstructions.tsx
│   ├── hooks/
│   │   ├── usePaymentStatus.ts     # 🔄 Polling
│   │   └── useClipboard.ts
│   └── styles/
│       └── payment.css
└── store/
    └── interfaces.json
```

**Props recebidos:**
```typescript
{
  appPayload: string,           // JSON com code + qrCodeBase64Image
  orderId: string,
  transactionId: string,
  onPaymentComplete?: () => void
}
```

---

## 🔗 URLs Importantes

### Braspag Sandbox
- API: `https://apisandbox.braspag.com.br`
- Query: `https://apiquerysandbox.braspag.com.br`
- OAuth: `https://authsandbox.braspag.com.br`

### Braspag Produção
- API: `https://api.braspag.com.br`
- Query: `https://apiquery.braspag.com.br`
- OAuth: `https://auth.braspag.com.br`

### VTEX
- Admin: `https://{account}.myvtex.com/admin`
- Gateway: `https://{account}.myvtex.com/admin/pci-gateway`

### Documentação
- [Braspag PIX](https://docs.cielo.com.br/split/reference/criar-qr-code-pix-2)
- [VTEX PPF](https://developers.vtex.com/docs/guides/payments-integration-payment-provider-framework)
- [Payment App](https://developers.vtex.com/docs/guides/payments-integration-payment-app)

---

## 🧪 Testes Prioritários

### 1. Pagamento Real (PRÓXIMO)
```
1. Gerar QR Code via authorization
2. Pagar com app bancário
3. Aguardar webhook
4. Validar status = 2
5. Confirmar split executado
6. Testar settle
```

### 2. Cancelamento
```
1. Gerar QR Code
2. Cancelar antes de pagar
3. Validar status = 10
```

### 3. Payment App
```
1. Renderizar QR Code
2. Testar botão copiar
3. Validar timer
4. Testar polling
5. Confirmar atualização de status
```

---

## 📊 Métricas Datadog

### Logs Principais
```
PIX_AUTHORIZATION_SUCCESS      → Autorização OK
PIX_SALE_CREATION_FAILED       → Erro criação
BRASPAG_NOTIFICATION_RECEIVED  → Webhook recebido
PAYMENT_STATUS_CHANGED         → Status atualizado
SPLIT_EXECUTED_BY_BRASPAG      → Split confirmado
VTEX_SETTLEMENT_APPROVED       → Liquidação OK
```

### Alertas Críticos
```
- Authentication failures > 5 in 5min
- Payment creation failure rate > 10%
- Webhook processing errors > 10 in 5min
```

---

## 🛠️ Troubleshooting Rápido

### Problema: QR Code não gerado
**Verificar:**
1. Credenciais Braspag corretas
2. OAuth2 token válido
3. Payload request correto
4. Logs de erro

### Problema: Webhook não recebe
**Verificar:**
1. URL configurada na Braspag
2. Endpoint público
3. Parse do body correto
4. Logs do middleware

### Problema: Split não executado
**Verificar:**
1. Merchant IDs corretos
2. SplitPayments no payload
3. Status Braspag
4. Logs de notificação

### Problema: Payment App não renderiza
**Verificar:**
1. paymentAppData correto
2. Payload JSON válido
3. Base64 QR Code correto
4. Console do browser

---

## 📦 Dependências

### Connector (node/)
```json
{
  "@vtex/api": "6.x",
  "@vtex/payment-provider": "1.x"
}
```

### Payment App
```json
{
  "vtex.styleguide": "9.x",
  "vtex.checkout-resources": "0.x"
}
```

---

## 🎯 Próximos Passos

### Imediato (Hoje)
1. ✅ Documentação completa (FEITO)
2. 🔄 Testar pagamento real PIX
3. 🔄 Validar webhook recebido

### Curto Prazo (Esta Semana)
1. Desenvolver Payment App
2. Corrigir mocks e hardcoded
3. Testes completos

### Médio Prazo (Próximas 2 Semanas)
1. Deploy homologação
2. Testes E2E completos
3. Deploy produção

---

## 📞 Suporte

### Braspag
- Email: suporte@braspag.com.br
- Docs: https://docs.cielo.com.br

### VTEX
- Help: help.vtex.com
- Community: community.vtex.com
- Docs: developers.vtex.com

---

## 🎓 Recursos de Aprendizado

### Tutoriais
1. [VTEX PPF Tutorial](https://developers.vtex.com/docs/guides/payments-integration-payment-provider-framework)
2. [Payment App Guide](https://developers.vtex.com/docs/guides/payments-integration-payment-app)
3. [Braspag Split Guide](https://docs.cielo.com.br/split/)

### Exemplos
- [Payment Provider Example](https://github.com/vtex-apps/payment-provider-example)
- [Payment App Example](https://github.com/vtex-apps/payment-app-example)

---

## ✅ Validação Final

### Antes de Deploy
- [ ] Todos os testes passando
- [ ] Credenciais de produção configuradas
- [ ] Webhooks configurados
- [ ] Monitoramento ativo
- [ ] Payment App funcionando
- [ ] Documentação atualizada
- [ ] Equipe treinada
- [ ] Rollback planejado

---

**Referência rápida pronta! Use este documento para consultas rápidas durante o desenvolvimento. 📚**

