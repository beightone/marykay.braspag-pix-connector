# 📱 Guia Completo - Desenvolvimento do Payment App PIX

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Payment App](#arquitetura-do-payment-app)
3. [Setup do Projeto](#setup-do-projeto)
4. [Implementação](#implementação)
5. [Integração com Connector](#integração-com-connector)
6. [Testes](#testes)
7. [Deploy](#deploy)

---

## 🎯 Visão Geral

### O que é o Payment App?

O **Payment App** é uma aplicação React que renderiza a interface de pagamento no checkout da VTEX. No caso do PIX, ele exibe:

- 📸 QR Code para escaneamento
- 📋 Código PIX (copia e cola)
- ⏱️ Timer de expiração
- 📊 Status do pagamento em tempo real
- 📝 Instruções de pagamento

### Fluxo de Integração

```
Checkout VTEX → Payment Provider → Payment App
     ↓                                  ↓
[Seleciona PIX]              [Renderiza QR Code]
     ↓                                  ↓
[Chama authorize()]          [Cliente paga]
     ↓                                  ↓
[Retorna paymentAppData]     [Polling de status]
     ↓                                  ↓
[Payment App recebe]         [Confirma pagamento]
```

---

## 🏗️ Arquitetura do Payment App

### Estrutura de Diretórios

```
braspag-pix-payment-app/
├── manifest.json
├── react/
│   ├── components/
│   │   ├── PixPayment.tsx          # Componente principal
│   │   ├── QRCodeDisplay.tsx       # Exibição do QR Code
│   │   ├── CopyButton.tsx          # Botão copiar
│   │   ├── PaymentInstructions.tsx # Instruções
│   │   ├── PaymentTimer.tsx        # Countdown
│   │   └── PaymentStatus.tsx       # Status do pagamento
│   ├── hooks/
│   │   ├── usePaymentStatus.ts     # Hook para polling
│   │   └── useClipboard.ts         # Hook para copiar
│   ├── styles/
│   │   └── payment.css             # Estilos
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   └── index.tsx                   # Entry point
├── store/
│   └── interfaces.json             # Store config
└── messages/
    ├── en.json
    └── pt.json
```

---

## 🚀 Setup do Projeto

### 1. Criar o App

```bash
vtex init
# Escolha: payment-app
# Nome: braspag-pix-payment-app
# Vendor: marykay
```

### 2. Manifest.json

```json
{
  "name": "braspag-pix-payment-app",
  "vendor": "marykay",
  "version": "1.0.0",
  "title": "Mary Kay PIX Payment",
  "description": "Payment interface for PIX with QR Code display",
  "builders": {
    "react": "3.x",
    "messages": "1.x",
    "store": "0.x"
  },
  "dependencies": {
    "vtex.styleguide": "9.x",
    "vtex.checkout-resources": "0.x",
    "vtex.payment-provider": "1.x"
  },
  "policies": [],
  "$schema": "https://raw.githubusercontent.com/vtex/node-vtex-api/master/gen/manifest.schema"
}
```

### 3. Instalar Dependências

```bash
cd react
yarn install
```

---

## 💻 Implementação

### 1. Types (`react/types/index.ts`)

```typescript
export interface PaymentAppData {
  code: string              // Código PIX (copia e cola)
  qrCodeBase64Image: string // QR Code em Base64
}

export interface PixPaymentProps {
  appPayload: string        // JSON stringified do PaymentAppData
  orderId: string
  transactionId: string
  onPaymentComplete?: () => void
  onPaymentError?: (error: Error) => void
}

export type PaymentStatus = 
  | 'pending'     // Aguardando pagamento
  | 'processing'  // Processando
  | 'paid'        // Pago
  | 'expired'     // Expirado
  | 'error'       // Erro

export interface PaymentStatusResponse {
  status: PaymentStatus
  paymentId: string
  timestamp: string
}
```

### 2. Componente Principal (`react/components/PixPayment.tsx`)

```tsx
import React, { useState, useEffect } from 'react'
import { PaymentAppData, PaymentStatus } from '../types'
import { usePaymentStatus } from '../hooks/usePaymentStatus'
import { QRCodeDisplay } from './QRCodeDisplay'
import { CopyButton } from './CopyButton'
import { PaymentTimer } from './PaymentTimer'
import { PaymentInstructions } from './PaymentInstructions'
import { PaymentStatus as PaymentStatusComponent } from './PaymentStatus'

interface PixPaymentProps {
  appPayload: string
  orderId: string
  transactionId: string
  onPaymentComplete?: () => void
}

export const PixPayment: React.FC<PixPaymentProps> = ({
  appPayload,
  orderId,
  transactionId,
  onPaymentComplete
}) => {
  const [paymentData, setPaymentData] = useState<PaymentAppData | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  const { status, loading } = usePaymentStatus(transactionId)

  useEffect(() => {
    try {
      const data = JSON.parse(appPayload) as PaymentAppData
      setPaymentData(data)
    } catch (err) {
      setError('Erro ao carregar dados de pagamento')
      console.error('Failed to parse payment data:', err)
    }
  }, [appPayload])

  useEffect(() => {
    if (status === 'paid' && onPaymentComplete) {
      onPaymentComplete()
    }
  }, [status, onPaymentComplete])

  if (error) {
    return (
      <div className="pix-payment-error">
        <h2>⚠️ Erro</h2>
        <p>{error}</p>
      </div>
    )
  }

  if (!paymentData) {
    return (
      <div className="pix-payment-loading">
        <div className="spinner" />
        <p>Carregando...</p>
      </div>
    )
  }

  const PIX_EXPIRATION_TIME = 2 * 60 * 60 // 2 horas em segundos

  return (
    <div className="pix-payment-container">
      <header className="pix-payment-header">
        <h1>Pague com PIX</h1>
        <PaymentTimer 
          initialTime={PIX_EXPIRATION_TIME}
          onExpire={() => setError('QR Code expirado')}
        />
      </header>

      <PaymentStatusComponent status={status} loading={loading} />

      <main className="pix-payment-main">
        <section className="qr-code-section">
          <QRCodeDisplay 
            qrCodeBase64={paymentData.qrCodeBase64Image}
            status={status}
          />
        </section>

        <section className="pix-code-section">
          <h2>Ou copie o código PIX</h2>
          <div className="code-display">
            <code className="pix-code">{paymentData.code}</code>
          </div>
          <CopyButton text={paymentData.code} />
        </section>

        <section className="instructions-section">
          <PaymentInstructions />
        </section>
      </main>

      <footer className="pix-payment-footer">
        <p className="order-id">Pedido: {orderId}</p>
        <p className="transaction-id">ID da transação: {transactionId}</p>
      </footer>
    </div>
  )
}
```

### 3. QR Code Display (`react/components/QRCodeDisplay.tsx`)

```tsx
import React from 'react'
import { PaymentStatus } from '../types'

interface QRCodeDisplayProps {
  qrCodeBase64: string
  status: PaymentStatus
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({
  qrCodeBase64,
  status
}) => {
  const isDisabled = status === 'paid' || status === 'expired' || status === 'error'

  return (
    <div className={`qr-code-display ${isDisabled ? 'disabled' : ''}`}>
      <img 
        src={`data:image/png;base64,${qrCodeBase64}`}
        alt="QR Code PIX"
        className="qr-code-image"
      />
      {isDisabled && (
        <div className="qr-code-overlay">
          {status === 'paid' && <span>✓ Pago</span>}
          {status === 'expired' && <span>⏱️ Expirado</span>}
          {status === 'error' && <span>⚠️ Erro</span>}
        </div>
      )}
    </div>
  )
}
```

### 4. Copy Button (`react/components/CopyButton.tsx`)

```tsx
import React from 'react'
import { useClipboard } from '../hooks/useClipboard'

interface CopyButtonProps {
  text: string
}

export const CopyButton: React.FC<CopyButtonProps> = ({ text }) => {
  const { copied, copy } = useClipboard()

  const handleCopy = () => {
    copy(text)
  }

  return (
    <button 
      className={`copy-button ${copied ? 'copied' : ''}`}
      onClick={handleCopy}
      aria-label="Copiar código PIX"
    >
      {copied ? (
        <>
          <span className="icon">✓</span>
          Código copiado!
        </>
      ) : (
        <>
          <span className="icon">📋</span>
          Copiar código PIX
        </>
      )}
    </button>
  )
}
```

### 5. Payment Timer (`react/components/PaymentTimer.tsx`)

```tsx
import React, { useState, useEffect } from 'react'

interface PaymentTimerProps {
  initialTime: number // em segundos
  onExpire?: () => void
}

export const PaymentTimer: React.FC<PaymentTimerProps> = ({
  initialTime,
  onExpire
}) => {
  const [timeRemaining, setTimeRemaining] = useState(initialTime)

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 0) {
          clearInterval(timer)
          if (onExpire) {
            onExpire()
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [onExpire])

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getTimeClass = (): string => {
    if (timeRemaining < 300) return 'critical' // < 5 minutos
    if (timeRemaining < 900) return 'warning' // < 15 minutos
    return 'normal'
  }

  return (
    <div className={`payment-timer ${getTimeClass()}`}>
      <span className="timer-label">Tempo restante:</span>
      <span className="timer-value">{formatTime(timeRemaining)}</span>
    </div>
  )
}
```

### 6. Payment Status (`react/components/PaymentStatus.tsx`)

```tsx
import React from 'react'
import { PaymentStatus as Status } from '../types'

interface PaymentStatusProps {
  status: Status
  loading: boolean
}

export const PaymentStatus: React.FC<PaymentStatusProps> = ({
  status,
  loading
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'pending':
        return {
          icon: '⏳',
          text: 'Aguardando pagamento',
          className: 'pending'
        }
      case 'processing':
        return {
          icon: '🔄',
          text: 'Processando pagamento',
          className: 'processing'
        }
      case 'paid':
        return {
          icon: '✅',
          text: 'Pagamento confirmado!',
          className: 'paid'
        }
      case 'expired':
        return {
          icon: '⏱️',
          text: 'QR Code expirado',
          className: 'expired'
        }
      case 'error':
        return {
          icon: '⚠️',
          text: 'Erro no pagamento',
          className: 'error'
        }
      default:
        return {
          icon: '❓',
          text: 'Status desconhecido',
          className: 'unknown'
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div className={`payment-status ${config.className}`}>
      <span className="status-icon">{config.icon}</span>
      <span className="status-text">{config.text}</span>
      {loading && <span className="status-loading">...</span>}
    </div>
  )
}
```

### 7. Payment Instructions (`react/components/PaymentInstructions.tsx`)

```tsx
import React from 'react'

export const PaymentInstructions: React.FC = () => {
  return (
    <div className="payment-instructions">
      <h2>Como pagar com PIX</h2>
      <ol className="instructions-list">
        <li>
          <span className="step-number">1</span>
          <div className="step-content">
            <h3>Abra o app do seu banco</h3>
            <p>Entre no aplicativo do seu banco ou instituição financeira</p>
          </div>
        </li>
        <li>
          <span className="step-number">2</span>
          <div className="step-content">
            <h3>Escolha pagar com PIX</h3>
            <p>Selecione a opção PIX no menu de pagamentos</p>
          </div>
        </li>
        <li>
          <span className="step-number">3</span>
          <div className="step-content">
            <h3>Escaneie o QR Code ou cole o código</h3>
            <p>Use a câmera para ler o QR Code ou cole o código copiado</p>
          </div>
        </li>
        <li>
          <span className="step-number">4</span>
          <div className="step-content">
            <h3>Confirme as informações</h3>
            <p>Verifique o valor e os dados do pagamento antes de confirmar</p>
          </div>
        </li>
        <li>
          <span className="step-number">5</span>
          <div className="step-content">
            <h3>Finalize o pagamento</h3>
            <p>Confirme a transação e aguarde a confirmação</p>
          </div>
        </li>
      </ol>

      <div className="instructions-note">
        <strong>Importante:</strong> O pagamento é processado instantaneamente. 
        Assim que você confirmar no app do banco, seu pedido será liberado automaticamente.
      </div>
    </div>
  )
}
```

### 8. Hook - usePaymentStatus (`react/hooks/usePaymentStatus.ts`)

```typescript
import { useState, useEffect, useCallback } from 'react'
import { PaymentStatus } from '../types'

interface UsePaymentStatusReturn {
  status: PaymentStatus
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

const POLLING_INTERVAL = 5000 // 5 segundos
const MAX_RETRIES = 360 // 30 minutos (360 * 5s)

export const usePaymentStatus = (
  transactionId: string
): UsePaymentStatusReturn => {
  const [status, setStatus] = useState<PaymentStatus>('pending')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/payment-provider/payment-status/${transactionId}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch payment status')
      }

      const data = await response.json()
      setStatus(data.status)
      setRetryCount(0)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error')
      setError(error)
      console.error('Error fetching payment status:', error)
    } finally {
      setLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    fetchStatus()

    const interval = setInterval(() => {
      if (status === 'paid' || status === 'expired' || status === 'error') {
        clearInterval(interval)
        return
      }

      if (retryCount >= MAX_RETRIES) {
        setStatus('expired')
        clearInterval(interval)
        return
      }

      fetchStatus()
      setRetryCount(prev => prev + 1)
    }, POLLING_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchStatus, status, retryCount])

  return {
    status,
    loading,
    error,
    refetch: fetchStatus
  }
}
```

### 9. Hook - useClipboard (`react/hooks/useClipboard.ts`)

```typescript
import { useState, useCallback } from 'react'

interface UseClipboardReturn {
  copied: boolean
  copy: (text: string) => Promise<void>
  error: Error | null
}

export const useClipboard = (timeout = 2000): UseClipboardReturn => {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setError(null)

      setTimeout(() => {
        setCopied(false)
      }, timeout)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to copy')
      setError(error)
      console.error('Failed to copy text:', error)
    }
  }, [timeout])

  return { copied, copy, error }
}
```

### 10. Styles (`react/styles/payment.css`)

```css
.pix-payment-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.pix-payment-header {
  text-align: center;
  margin-bottom: 32px;
}

.pix-payment-header h1 {
  font-size: 28px;
  font-weight: 600;
  color: #142032;
  margin-bottom: 16px;
}

.payment-timer {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
}

.payment-timer.normal {
  background-color: #e3f2fd;
  color: #1565c0;
}

.payment-timer.warning {
  background-color: #fff3e0;
  color: #e65100;
}

.payment-timer.critical {
  background-color: #ffebee;
  color: #c62828;
}

.timer-value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.payment-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
  font-size: 16px;
  font-weight: 500;
}

.payment-status.pending {
  background-color: #fff9e1;
  color: #a67c00;
}

.payment-status.processing {
  background-color: #e3f2fd;
  color: #1565c0;
}

.payment-status.paid {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.payment-status.expired,
.payment-status.error {
  background-color: #ffebee;
  color: #c62828;
}

.qr-code-section {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.qr-code-display {
  position: relative;
  padding: 16px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.qr-code-image {
  display: block;
  width: 280px;
  height: 280px;
}

.qr-code-display.disabled {
  opacity: 0.5;
}

.qr-code-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 12px;
  font-size: 24px;
  font-weight: 600;
}

.pix-code-section {
  margin-bottom: 32px;
}

.pix-code-section h2 {
  font-size: 16px;
  font-weight: 600;
  color: #142032;
  margin-bottom: 12px;
  text-align: center;
}

.code-display {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  overflow-x: auto;
}

.pix-code {
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  word-break: break-all;
  color: #424242;
}

.copy-button {
  width: 100%;
  padding: 14px;
  background: #134cd8;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.copy-button:hover {
  background: #0d3ba8;
}

.copy-button.copied {
  background: #2e7d32;
}

.copy-button:active {
  transform: scale(0.98);
}

.instructions-section {
  margin-top: 48px;
}

.payment-instructions h2 {
  font-size: 20px;
  font-weight: 600;
  color: #142032;
  margin-bottom: 24px;
}

.instructions-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
}

.instructions-list li {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.step-number {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: #134cd8;
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}

.step-content h3 {
  font-size: 16px;
  font-weight: 600;
  color: #142032;
  margin: 0 0 4px 0;
}

.step-content p {
  font-size: 14px;
  color: #5e6e82;
  margin: 0;
}

.instructions-note {
  padding: 16px;
  background: #e8f5e9;
  border-left: 4px solid #2e7d32;
  border-radius: 4px;
  font-size: 14px;
  color: #1b5e20;
}

.instructions-note strong {
  font-weight: 600;
}

.pix-payment-footer {
  margin-top: 48px;
  padding-top: 24px;
  border-top: 1px solid #e0e0e0;
  text-align: center;
  font-size: 12px;
  color: #9e9e9e;
}

.pix-payment-loading,
.pix-payment-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #134cd8;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

### 11. Entry Point (`react/index.tsx`)

```tsx
import React from 'react'
import { PixPayment } from './components/PixPayment'
import './styles/payment.css'

export default PixPayment
```

### 12. Store Configuration (`store/interfaces.json`)

```json
{
  "pix-payment": {
    "component": "PixPayment",
    "render": "client"
  }
}
```

### 13. Messages (`messages/pt.json`)

```json
{
  "payment.title": "Pague com PIX",
  "payment.timer.label": "Tempo restante:",
  "payment.status.pending": "Aguardando pagamento",
  "payment.status.processing": "Processando pagamento",
  "payment.status.paid": "Pagamento confirmado!",
  "payment.status.expired": "QR Code expirado",
  "payment.status.error": "Erro no pagamento",
  "payment.qrcode.title": "Escaneie o QR Code",
  "payment.code.title": "Ou copie o código PIX",
  "payment.copy.button": "Copiar código PIX",
  "payment.copy.success": "Código copiado!",
  "payment.instructions.title": "Como pagar com PIX",
  "payment.instructions.step1.title": "Abra o app do seu banco",
  "payment.instructions.step1.description": "Entre no aplicativo do seu banco ou instituição financeira",
  "payment.instructions.step2.title": "Escolha pagar com PIX",
  "payment.instructions.step2.description": "Selecione a opção PIX no menu de pagamentos",
  "payment.instructions.step3.title": "Escaneie o QR Code ou cole o código",
  "payment.instructions.step3.description": "Use a câmera para ler o QR Code ou cole o código copiado",
  "payment.instructions.step4.title": "Confirme as informações",
  "payment.instructions.step4.description": "Verifique o valor e os dados do pagamento antes de confirmar",
  "payment.instructions.step5.title": "Finalize o pagamento",
  "payment.instructions.step5.description": "Confirme a transação e aguarde a confirmação"
}
```

---

## 🔗 Integração com Connector

### Dados Enviados pelo Connector

O connector retorna no `authorize()`:

```typescript
{
  paymentAppData: {
    appName: "vtex-payment-app",
    payload: JSON.stringify({
      code: "00020101021226990014br.gov.bcb.pix...",
      qrCodeBase64Image: "iVBORw0KGgoAAAANSUhEUgAA..."
    })
  }
}
```

### Como o Payment App Recebe

O VTEX Checkout automaticamente renderiza o component registrado em `store/interfaces.json` e passa os props:

```tsx
<PixPayment 
  appPayload={paymentAppData.payload}
  orderId="order-123"
  transactionId="transaction-456"
  onPaymentComplete={() => {
    // Redirecionar para página de sucesso
  }}
/>
```

---

## 🧪 Testes

### 1. Testes Locais

```bash
# Link do app
cd braspag-pix-payment-app
vtex link

# Em outro terminal, acesse o checkout de desenvolvimento
vtex browse
```

### 2. Testes Unitários

```bash
# Instalar dependências de teste
yarn add -D @testing-library/react @testing-library/jest-dom jest

# Executar testes
yarn test
```

**Exemplo de Teste:**

```typescript
// react/__tests__/PixPayment.test.tsx
import { render, screen } from '@testing-library/react'
import { PixPayment } from '../components/PixPayment'

describe('PixPayment', () => {
  const mockPayload = JSON.stringify({
    code: '00020101021226990014br.gov.bcb.pix...',
    qrCodeBase64Image: 'iVBORw0KGgoAAAANSUhEUgAA...'
  })

  it('renders QR code correctly', () => {
    render(
      <PixPayment 
        appPayload={mockPayload}
        orderId="123"
        transactionId="456"
      />
    )

    expect(screen.getByAlt('QR Code PIX')).toBeInTheDocument()
  })

  it('displays copy button', () => {
    render(
      <PixPayment 
        appPayload={mockPayload}
        orderId="123"
        transactionId="456"
      />
    )

    expect(screen.getByText('Copiar código PIX')).toBeInTheDocument()
  })
})
```

### 3. Testes E2E

```bash
# Instalar Cypress
yarn add -D cypress

# Abrir Cypress
yarn cypress open
```

---

## 🚀 Deploy

### 1. Publicar o App

```bash
# Workspace de desenvolvimento
vtex link

# Testar completamente

# Publicar versão
vtex publish

# Instalar no master
vtex install marykay.braspag-pix-payment-app@1.0.0 -w master
```

### 2. Configurar no Admin

1. Acesse Admin → Payments → Payment Providers
2. Configure o connector `braspag-pix-connector`
3. O Payment App será automaticamente usado pelo checkout

### 3. Validar em Produção

```bash
# Acessar checkout
https://{account}.myvtex.com/checkout

# Selecionar PIX como método de pagamento
# Validar renderização do QR Code
# Testar pagamento real
```

---

## 📊 Monitoramento

### Métricas Importantes

1. **Taxa de Renderização**: % de QR Codes renderizados com sucesso
2. **Taxa de Cópia**: % de usuários que copiam o código
3. **Taxa de Conversão**: % de QR Codes que resultam em pagamento
4. **Tempo Médio**: Tempo entre exibição e pagamento

### Logs Recomendados

```typescript
// Adicionar no Payment App
console.log('PIX_PAYMENT_RENDERED', {
  transactionId,
  timestamp: new Date().toISOString()
})

console.log('PIX_CODE_COPIED', {
  transactionId,
  timestamp: new Date().toISOString()
})

console.log('PIX_PAYMENT_COMPLETED', {
  transactionId,
  duration: completionTime - renderTime,
  timestamp: new Date().toISOString()
})
```

---

## 🎯 Checklist de Desenvolvimento

### Setup
- [ ] Criar projeto Payment App
- [ ] Configurar manifest.json
- [ ] Instalar dependências
- [ ] Configurar TypeScript

### Implementação
- [ ] Criar tipos TypeScript
- [ ] Implementar componente principal
- [ ] Implementar QR Code display
- [ ] Implementar botão copiar
- [ ] Implementar timer
- [ ] Implementar status
- [ ] Implementar instruções
- [ ] Criar hooks (status, clipboard)
- [ ] Adicionar estilos

### Testes
- [ ] Testes unitários
- [ ] Testes de integração
- [ ] Testes E2E
- [ ] Testes de responsividade
- [ ] Testes de acessibilidade

### Deploy
- [ ] Publicar app
- [ ] Instalar em homologação
- [ ] Validar integração com connector
- [ ] Testar pagamento real
- [ ] Deploy em produção

---

## 📚 Referências

1. [VTEX Payment App Guide](https://developers.vtex.com/docs/guides/payments-integration-payment-app)
2. [React App Development VTEX](https://developers.vtex.com/docs/guides/vtex-io-documentation-developing-storefront-apps)
3. [Styleguide VTEX](https://styleguide.vtex.com/)

---

**Pronto para começar o desenvolvimento! 🚀**

