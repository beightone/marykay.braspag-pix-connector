/**
 * Structured Logger for Payment Connector
 * Provides consistent logging throughout the application
 */

export interface StructuredLogger {
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void
  debug(message: string, metadata?: Record<string, unknown>): void
}

/**
 * Payment connector specific logger with standardized messages
 */
export class PaymentConnectorLogger implements StructuredLogger {
  private prefix: string

  constructor(private baseLogger: StructuredLogger, component = 'CONNECTOR') {
    this.prefix = component
  }

  public info(message: string, metadata?: Record<string, unknown>): void {
    this.baseLogger.info(`${this.prefix}: ${message}`, metadata)
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    this.baseLogger.warn(`${this.prefix}: ${message}`, metadata)
  }

  public error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void {
    const errorMeta = {
      ...metadata,
      error: error instanceof Error ? error.message : String(error),
    }

    this.baseLogger.error(`${this.prefix}: ${message}`, errorMeta)
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    this.baseLogger.debug(`${this.prefix}: ${message}`, metadata)
  }

  /**
   * Create logger for specific operations
   */
  public forOperation(operation: string): PaymentConnectorLogger {
    return new PaymentConnectorLogger(
      this.baseLogger,
      `${this.prefix}:${operation}`
    )
  }
}

/**
 * Console logger implementation for compatibility
 */
export class ConsoleStructuredLogger implements StructuredLogger {
  public info(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.info(message, metadata ? JSON.stringify(metadata, null, 2) : '')
  }

  public warn(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.warn(message, metadata ? JSON.stringify(metadata, null, 2) : '')
  }

  public error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void {
    // eslint-disable-next-line no-console
    console.error(
      message,
      error,
      metadata ? JSON.stringify(metadata, null, 2) : ''
    )
  }

  public debug(message: string, metadata?: Record<string, unknown>): void {
    // eslint-disable-next-line no-console
    console.debug(message, metadata ? JSON.stringify(metadata, null, 2) : '')
  }
}

/**
 * Logger factory for creating component-specific loggers
 */
export class LoggerFactory {
  private static baseLogger: StructuredLogger = new ConsoleStructuredLogger()

  public static setBaseLogger(logger: StructuredLogger): void {
    this.baseLogger = logger
  }

  public static createLogger(component: string): PaymentConnectorLogger {
    return new PaymentConnectorLogger(this.baseLogger, component)
  }
}
