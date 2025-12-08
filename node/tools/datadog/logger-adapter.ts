import { Logger as DatadogLogger } from './datadog'
import { DatadogCompatibleLogger } from './logger.types'

export class DatadogLoggerAdapter implements DatadogCompatibleLogger {
  constructor(private datadogLogger: DatadogLogger) {}

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.datadogLogger.info(message, metadata ?? {})
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.datadogLogger.warn(message, metadata ?? {})
  }

  public error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void {
    const isError = error instanceof Error
    const isSecondArgObject = !isError && typeof error === 'object' && error !== null

    if (isSecondArgObject && metadata === undefined) {
      this.datadogLogger.error(message, error as Record<string, unknown>)
      return
    }

    const meta: Record<string, unknown> = { ...(metadata ?? {}) }

    if (isError) {
      meta.error = error.message
      if (error.stack) meta.stack = error.stack
    } else if (error !== undefined) {
      meta.error = error
    }

    this.datadogLogger.error(message, meta)
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    // Datadog não tem debug, usando info
    this.datadogLogger.info(`[DEBUG] ${message}`, metadata ?? {})
  }
}
