import { Logger as DatadogLogger } from './datadog'
import { DatadogCompatibleLogger } from './logger.types'

export class DatadogLoggerAdapter implements DatadogCompatibleLogger {
  constructor(private datadogLogger: DatadogLogger) {}

  public info(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info('[ADAPTER_DEBUG] info() called:', { message })
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
    const errorMeta = {
      ...metadata,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }

    this.datadogLogger.error(message, errorMeta)
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    // Datadog não tem debug, usando info
    this.datadogLogger.info(`[DEBUG] ${message}`, metadata ?? {})
  }
}
