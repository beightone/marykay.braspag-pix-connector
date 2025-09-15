export interface DatadogCompatibleLogger {
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(
    message: string,
    error?: Error | unknown,
    metadata?: Record<string, unknown>
  ): void
  debug(message: string, metadata?: Record<string, unknown>): void
}
