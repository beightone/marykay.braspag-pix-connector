/* eslint-disable no-console */
export interface Logger {
  info(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
}

export class ConsoleLogger implements Logger {
  public info(message: string, data?: Record<string, unknown>): void {
    console.log(`INFO: ${message}`, data ?? '')
  }

  public error(message: string, data?: Record<string, unknown>): void {
    console.error(`ERROR: ${message}`, data ?? '')
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    console.warn(`WARN: ${message}`, data ?? '')
  }
}

export class VtexLogger implements Logger {
  constructor(
    private vtexLogger: {
      info?: (message: string, data?: Record<string, unknown>) => void
      error?: (message: string, data?: Record<string, unknown>) => void
      warn?: (message: string, data?: Record<string, unknown>) => void
    }
  ) {}

  public info(message: string, data?: Record<string, unknown>): void {
    this.vtexLogger?.info?.(message, data)
  }

  public error(message: string, data?: Record<string, unknown>): void {
    this.vtexLogger?.error?.(message, data)
  }

  public warn(message: string, data?: Record<string, unknown>): void {
    this.vtexLogger?.warn?.(message, data)
  }
}
