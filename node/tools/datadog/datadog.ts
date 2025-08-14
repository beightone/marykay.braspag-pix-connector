import type { Datadog } from './datadog-client'
import type { DatadogOptions, LogType } from './types'
import { datadogLog } from './datadog_parser'

export class Logger {
  private ctx: Context
  private datadog: Datadog
  private enabled: boolean

  constructor(ctx: Context, datadog: Datadog) {
    this.ctx = ctx
    this.datadog = datadog
    this.enabled = true
  }

  private async catchError(data: any) {
    try {
      await this.datadog.save(data)
    } catch (err) {
      console.info('DATADOG_ERROR', err)
    }
  }

  public parsedLog = (title: string, content: unknown) => {
    return this.local(
      'PARSED_LOG',
      this.parseData(title, content, 'INFO'),
      'INFO'
    )
  }

  public info = (title: string, content: unknown, options?: DatadogOptions) => {
    if (!this.enabled) return this.local(title, content, 'INFO')

    this.catchError(this.parseData(title, content, 'INFO', options))
  }

  public warn = (title: string, content: unknown, options?: DatadogOptions) => {
    if (!this.enabled) return this.local(title, content, 'WARN')

    this.catchError(this.parseData(title, content, 'WARN', options))
  }

  public error = (
    title: string,
    content: unknown,
    options?: DatadogOptions
  ) => {
    if (!this.enabled) return this.local(title, content, 'ERROR')

    this.catchError(this.parseData(title, content, 'ERROR', options))
  }

  private parseData(
    title: string,
    content: unknown,
    type: LogType,
    options?: DatadogOptions
  ) {
    return datadogLog(this.ctx, title, content, type, options)
  }

  private local = (title: string, content: unknown, type: LogType) => {
    const color = type === 'ERROR' ? '31' : '36'

    console.info(`\x1b[${color}m`, title, content)
  }

  public isEnabled = () => {
    return this.enabled
  }
}
