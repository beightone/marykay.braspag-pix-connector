# Hubly Integration

## Visão Geral

Esta documentação descreve a integração com a API Hubly para obtenção automática do Braspag ID das consultoras Mary Kay. A integração permite que o conector de pagamento PIX busque dinamicamente o identificador correto da subconta Braspag para realizar o split de pagamentos.

## Autenticação

A API Hubly utiliza autenticação via header HTTP:

- **Header**: `x-hubly-key`
- **Valor**: API Key configurada nas settings do app

A configuração da API Key é feita através das configurações do app no VTEX Admin.

## Configuração

### Settings do App

As seguintes configurações devem ser adicionadas nas settings do app:

| Campo | Tipo | Descrição | Obrigatório |
|-------|------|-----------|-------------|
| `hublyApiKey` | string | API Key para acessar a API Hubly | Sim (para split) |
| `hublyOrganizationId` | string | ID da organização na Hubly | Não (padrão: a1f197a1-559c-4114-b6e2-d646a367fc5c) |

### Permissões

O app requer a seguinte política de outbound-access:

```json
{
  "name": "outbound-access",
  "attrs": {
    "host": "external.gohubly.com",
    "path": "/api/organizations/*"
  }
}
```

## Fluxo de Integração

### 1. Extração do Consultant ID

Durante o processo de autorização de pagamento, o sistema:

1. Extrai o `orderId` da requisição de autorização
2. Busca os dados do pedido via OMS Client
3. Localiza o `consultantId` no `customData.customApps` com `id: 'consultant'`
4. Extrai apenas o UUID do campo `consultantId` (primeira parte antes do `_`)

**Exemplo**:
```typescript
// Campo no order: "consultantId": "959fe771-9332-48cd-875e-489ac1739d0a_123"
// Valor extraído: "959fe771-9332-48cd-875e-489ac1739d0a"
```

### 2. Consulta à API Hubly

Com o `consultantId` extraído, o sistema faz uma requisição GET para:

```
GET https://external.gohubly.com/api/organizations/{organizationId}/affiliates/{consultantId}
```

**Headers**:
```
x-hubly-key: {apiKey}
```

### 3. Resposta da API

**Status de Sucesso**: `200 OK`

**Exemplo de Resposta**:

```json
{
  "id": "959fe771-9332-48cd-875e-489ac1739d0a",
  "user": {
    "username": "Luciana Nadal Teste",
    "email": "luciana.nadal0906@gmail.com",
    "document": "36363521807",
    "phone": "11996752767",
    "avatar": "https://plugone-staging.nyc3.digitaloceanspaces.com/user_avatar/d39e32d0-920d-41dc-b820-c2a25174888e.jpeg"
  },
  "marketingData": {
    "utmSource": "external",
    "utmCampaign": "959fe771-9332-48cd-875e-489ac1739d0a_a1f197a1-559c-4114-b6e2-d646a367fc5c"
  },
  "additionalInfo": [
    {
      "key": "ConsultantId",
      "value": "GN5913"
    },
    {
      "key": "Braspag ID",
      "value": "56b61a55-762a-40a6-8689-a89da416f034"
    },
    {
      "key": "Braspag Status",
      "value": "Aprovado (2)"
    }
  ],
  "affiliateStoreUrl": "https://loja.marykay.com.br/minha-vitrine?slug=teste-lu-nadal&oid=a1f197a1-559c-4114-b6e2-d646a367fc5c",
  "commission": 30,
  "active": true
}
```

### 4. Extração do Braspag ID

O sistema busca no array `additionalInfo` o objeto com `key: "Braspag ID"` e extrai o valor correspondente:

```typescript
const braspagInfo = consultant.additionalInfo.find(
  (info) => info.key === 'Braspag ID'
)
const braspagId = braspagInfo?.value
// Resultado: "56b61a55-762a-40a6-8689-a89da416f034"
```

### 5. Utilização no Split de Pagamento

O `braspagId` é utilizado como `SubordinateMerchantId` na configuração de split de pagamentos Braspag:

```typescript
{
  SubordinateMerchantId: braspagId, // ID da consultora obtido via Hubly
  Amount: consultantAmount,
  Fares: {
    Mdr: 50.0,
    Fee: 100
  }
}
```

## Tratamento de Erros

### Fallback

Se a consulta à API Hubly falhar ou não retornar um Braspag ID válido, o sistema utiliza o valor de `monitfyConsultantId` como fallback (comportamento anterior).

**Ordem de prioridade**:
1. `braspagId` (obtido via Hubly)
2. `monitfyConsultantId` (valor legado)

### Logs de Erro

Erros na consulta à API Hubly são registrados no console:

```typescript
console.error('Failed to fetch consultant data from Hubly', error)
```

## Arquitetura

### Novos Componentes

#### HublyClient (`node/clients/hubly/index.ts`)

Cliente HTTP para integração com a API Hubly.

**Métodos principais**:

- `getConsultantData(consultantId, apiKey, organizationId)`: Busca dados da consultora
- `getBraspagIdFromConsultant(consultant)`: Extrai o Braspag ID dos dados da consultora

#### Tipos (`node/clients/hubly/types.ts`)

Interfaces TypeScript para tipagem das respostas da API Hubly:

- `HublyConsultantResponse`: Resposta completa da API
- `HublyClientConfig`: Configuração do cliente

### Componentes Modificados

#### OMSClient (`node/clients/orders/index.ts`)

- Adicionada instância do `HublyClient`
- Método `extractOrderData` agora aceita `hublyConfig` opcional
- Busca automática do `braspagId` quando `consultantId` e `apiKey` estão disponíveis

#### BraspagPixAdapter (`node/adapters/braspag-pix-adapter.ts`)

- Interface `BraspagPixAdapterConfig` agora inclui `braspagId` opcional
- Método `createSplitPayments` usa `braspagId` com fallback para `monitfyConsultantId`

#### AuthorizationService (`node/services/authorization/index.ts`)

- Obtém configurações Hubly do contexto (`settings`)
- Passa configurações para `extractOrderData`
- Inclui `braspagId` na criação do request PIX

## Exemplo Completo de Fluxo

```
1. Cliente finaliza compra com consultora
   ↓
2. VTEX cria ordem com consultantId no customData
   ↓
3. Payment Provider recebe requisição de autorização
   ↓
4. OMSClient extrai consultantId da ordem
   ↓
5. HublyClient consulta API Hubly com consultantId
   ↓
6. Sistema extrai braspagId da resposta Hubly
   ↓
7. BraspagPixAdapter cria split usando braspagId
   ↓
8. BraspagClient cria transação PIX com split configurado
   ↓
9. Split é processado automaticamente pela Braspag
```

## Requisitos Técnicos

### Dependências

- `@vtex/api`: Cliente HTTP base
- TypeScript 4.x+
- Node.js 14.x+

### Configuração de Rede

- Acesso HTTPS à `external.gohubly.com`
- Timeout padrão: 30 segundos
- Retries: 3 tentativas

## Segurança

### Dados Sensíveis

- A API Key da Hubly é armazenada nas settings do app (criptografada pela VTEX)
- Não expor a API Key em logs ou mensagens de erro
- O Braspag ID não é considerado dado sensível, mas deve ser validado

### Validações

- Verificação de presença do `consultantId`
- Verificação de presença da `hublyApiKey`
- Tratamento de erros HTTP (4xx, 5xx)
- Validação da estrutura da resposta da API

## Monitoramento e Logs

### Logs Importantes

O sistema registra os seguintes eventos:

1. **Sucesso na busca de dados da consultora** (implícito via log de split payments)
2. **Falha na busca de dados**: `Failed to fetch consultant data from Hubly`
3. **Split criado**: Logs do `BraspagPixAuthorizationService` incluem quantidade de splits

### Métricas Recomendadas

- Taxa de sucesso de consultas à API Hubly
- Latência das consultas à API Hubly
- Uso de fallback para `monitfyConsultantId`
- Transações com split bem-sucedido vs. sem split

