# 📚 Mary Kay Braspag PIX Connector - Documentação Completa

## 🎯 Visão Geral

Este é o **Payment Provider Connector** para integração de pagamentos PIX com **split transacional** entre consultoras e marketplace Mary Kay, utilizando a API da Braspag (Cielo).

**Status do Projeto:** ✅ Em desenvolvimento avançado  
**Última atualização:** Janeiro 2025

---

## 📖 Documentação Disponível

### 1. 📊 [Sumário Executivo](./EXECUTIVE_SUMMARY.md)
**Ideal para:** Gestores, stakeholders, visão geral do projeto

**Conteúdo:**
- Status atual do desenvolvimento
- Roadmap e prazos
- Pontos críticos e recomendações
- KPIs e métricas
- Avaliação geral

### 2. 📋 [Análise Completa do Projeto](./ANALISE_COMPLETA_PROJETO.md)
**Ideal para:** Desenvolvedores, analistas técnicos

**Conteúdo:**
- Arquitetura completa do sistema
- Estrutura de código detalhada
- Serviços implementados
- Adapters e clients
- Mapeamento de status Braspag
- Testes realizados e pendentes
- Pontos de atenção críticos
- Próximos passos detalhados

### 3. 📱 [Guia de Desenvolvimento do Payment App](./PAYMENT_APP_GUIDE.md)
**Ideal para:** Desenvolvedores frontend React

**Conteúdo:**
- Setup completo do projeto
- Implementação passo a passo
- Componentes React
- Hooks customizados
- Integração com connector
- Testes e deploy
- Código completo pronto para uso

### 4. 🔄 [Fluxo Técnico Completo](./FLUXO_TECNICO_COMPLETO.md)
**Ideal para:** Arquitetos, analistas de integração

**Conteúdo:**
- Diagramas de sequência
- Máquina de estados
- Pontos de integração
- Autenticação OAuth2
- Persistência de dados (VBase)
- Cenários de teste
- Troubleshooting detalhado
- Referências de APIs

### 5. ⚡ [Quick Reference](./QUICK_REFERENCE.md)
**Ideal para:** Consultas rápidas durante desenvolvimento

**Conteúdo:**
- Comandos úteis
- Checklist completo
- Status codes
- Fluxo simplificado
- URLs importantes
- Troubleshooting rápido

### 6. ⚙️ [Guia de Configuração](./CONFIGURATION.md)
**Ideal para:** DevOps, configuração de ambientes

**Conteúdo:**
- Setup de ambientes
- Configurações da Braspag
- Configurações da VTEX
- Webhooks e notificações
- Segurança e compliance
- Monitoramento e logs

---

## 🚀 Quick Start

### Para Desenvolvedores

1. **Entenda o projeto:**
   - Leia o [Sumário Executivo](./EXECUTIVE_SUMMARY.md)
   - Revise a [Análise Completa](./ANALISE_COMPLETA_PROJETO.md)

2. **Configure o ambiente:**
   ```bash
   cd node
   vtex link
   ```

3. **Desenvolva o Payment App:**
   - Siga o [Guia do Payment App](./PAYMENT_APP_GUIDE.md)

4. **Consulte referências:**
   - Use [Quick Reference](./QUICK_REFERENCE.md) para consultas rápidas
   - Use [Fluxo Técnico](./FLUXO_TECNICO_COMPLETO.md) para entender integrações

---

## 📊 Status Atual

### ✅ Concluído
- Payment Provider Connector (PPF)
- Autorização PIX com geração de QR Code
- Cliente Braspag API com OAuth2
- Split transacional 75/25
- Webhook handler para notificações
- Cancelamento de transações
- Liquidação de pagamentos
- Logging completo Datadog
- Persistência VBase
- Documentação completa

### ⏳ Em Andamento
- Testes de pagamento real (Braspag liberado)
- Desenvolvimento do Payment App

### 🔄 Próximos Passos
1. Testar pagamento real
2. Desenvolver Payment App (3-5 dias)
3. Corrigir mocks hardcoded
4. Testes completos
5. Deploy em produção

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    VTEX CHECKOUT                            │
│                                                             │
│  Cliente finaliza compra → Seleciona PIX                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│            PAYMENT PROVIDER CONNECTOR (PPF)                 │
│                                                             │
│  • Autorização (authorize)       ✅                         │
│  • Cancelamento (cancel)         ✅                         │
│  • Liquidação (settle)           ✅                         │
│  • Webhook (inbound)             ✅                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   BRASPAG API                               │
│                                                             │
│  • OAuth2 Authentication                                    │
│  • Create PIX Sale                                          │
│  • Query Payment Status                                     │
│  • Split Transacional Automático                           │
│    ├─ Consultora: 75%                                       │
│    └─ Marketplace: 25%                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 💰 Split de Pagamentos

### Como Funciona

Quando um cliente paga via PIX:

1. **Valor total:** R$ 100,00
2. **Split automático:**
   - **Consultora:** R$ 75,00 (75%)
   - **Mary Kay:** R$ 25,00 (25%)

O split é **transacional** - executado automaticamente pela Braspag no momento do pagamento.

---

## 🔍 Principais Endpoints

### Autorização
```
POST /_v/api/marykay.braspag-pix-connector/payments
```
Gera QR Code PIX com split configurado

### Webhook
```
POST /_v/braspag-pix-connector/v0/notifications
```
Recebe notificações de status da Braspag

### Cancelamento
```
POST /_v/api/marykay.braspag-pix-connector/payments/{id}/cancellations
```
Cancela transação PIX (antes do pagamento)

### Liquidação
```
POST /_v/api/marykay.braspag-pix-connector/payments/{id}/settlements
```
Confirma liquidação do pedido

---

## 🚨 Pontos Críticos

### 🔴 URGENTE

1. **CustomData Mock** (`node/services/authorization/index.ts:42`)
   - Substituir mock por dados reais do `authorization.miniCart.customData`

2. **Credenciais Hardcoded** (`node/clients/braspag/index.ts:28`)
   - Remover fallback com credenciais fixas

### 🟡 IMPORTANTE

3. **Merchant IDs** - Validar com Braspag
4. **Timeout** - Ajustar de 15min para 2 horas

---

## 📱 Payment App

O **Payment App** é uma aplicação React que renderiza o QR Code no checkout.

**Status:** 🔄 Precisa ser desenvolvido

**Funcionalidades:**
- ✅ Exibição de QR Code (Base64)
- ✅ Código PIX copiável
- ✅ Timer de expiração (2h)
- ✅ Polling de status
- ✅ Instruções de pagamento

**Guia completo:** [Payment App Guide](./PAYMENT_APP_GUIDE.md)

---

## 🧪 Testes

### ✅ Realizados
- Autorização com geração de QR Code

### ⏳ Pendentes
- Pagamento real (Braspag liberado ✅)
- Recebimento de webhook
- Cancelamento
- Liquidação

---

## 📚 Links Úteis

### Documentação Externa
- [Braspag PIX API](https://docs.cielo.com.br/split/reference/criar-qr-code-pix-2)
- [VTEX PPF](https://developers.vtex.com/docs/guides/payments-integration-payment-provider-framework)
- [VTEX Payment App](https://developers.vtex.com/docs/guides/payments-integration-payment-app)

### URLs Braspag
- **Sandbox API:** https://apisandbox.braspag.com.br
- **Production API:** https://api.braspag.com.br

---

## 📞 Suporte

### Braspag
- Email: suporte@braspag.com.br
- Docs: https://docs.cielo.com.br

### VTEX
- Help: https://help.vtex.com
- Community: https://community.vtex.com

---

## 🎓 Como Usar Esta Documentação

### Para Entender o Projeto
1. Comece pelo [Sumário Executivo](./EXECUTIVE_SUMMARY.md)
2. Aprofunde na [Análise Completa](./ANALISE_COMPLETA_PROJETO.md)

### Para Desenvolver
1. Leia o [Fluxo Técnico](./FLUXO_TECNICO_COMPLETO.md)
2. Siga o [Payment App Guide](./PAYMENT_APP_GUIDE.md)
3. Use o [Quick Reference](./QUICK_REFERENCE.md)

### Para Configurar
1. Siga o [Configuration Guide](./CONFIGURATION.md)

### Para Troubleshooting
1. Consulte [Fluxo Técnico - Troubleshooting](./FLUXO_TECNICO_COMPLETO.md#-troubleshooting)

---

## ✅ Checklist Geral

- [x] Connector implementado
- [x] Testes de autorização
- [x] Documentação completa
- [ ] Pagamento real testado
- [ ] Payment App desenvolvido
- [ ] Correções de mocks
- [ ] Deploy em produção

---

## 📈 Roadmap

| Fase | Duração | Status |
|------|---------|--------|
| 1. Validação | 2-3 dias | ⏳ Em andamento |
| 2. Payment App | 5-7 dias | 🔄 Próximo |
| 3. Correções | 2-3 dias | ⏳ Aguardando |
| 4. Homologação | 3-5 dias | ⏳ Aguardando |
| 5. Produção | 1-2 dias | ⏳ Aguardando |

**Total:** 15-20 dias úteis

---

**Última atualização:** Janeiro 2025  
**Versão:** 1.0.0  
**Status:** ✅ Em desenvolvimento avançado
