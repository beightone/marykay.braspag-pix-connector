import { Datadog } from '../../clients/datadog'
import { DatadogOptions, LogType } from './types'
import { datadogLog } from './datadog_parser'

export class Logger {
  private ctx: Context
  private datadog: Datadog
  private enabled: boolean

  constructor(ctx: Context, datadog: Datadog) {
    this.ctx = ctx
    this.datadog = datadog
    
    // Enable Datadog based on proper conditions
    this.enabled =true
      // ctx.vtex?.workspace !== 'master'
    
    
  }

  private async catchError(data: unknown) {
    try {
      await this.datadog.save(data)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.info('DATADOG_ERROR', err)
    }
  }

  public parsedLog = (title: string, content: unknown) => {
    return this.local(
      'PARSED_LOG',
      this.parseData({ title, content, type: 'INFO' }),
      'INFO'
    )
  }

  public info = (title: string, content: unknown, options?: DatadogOptions) => {
    if (!this.enabled) return this.local(title, content, 'INFO')

    this.catchError(this.parseData({ title, content, type: 'INFO', options }))
  }

  public warn = (title: string, content: unknown, options?: DatadogOptions) => {
    if (!this.enabled) return this.local(title, content, 'WARN')

    this.catchError(this.parseData({ title, content, type: 'WARN', options }))
  }

  public error = (
    title: string,
    content: unknown,
    options?: DatadogOptions
  ) => {
    if (!this.enabled) return this.local(title, content, 'ERROR')

    this.catchError(this.parseData({ title, content, type: 'ERROR', options }))
  }

  private parseData(params: {
    title: string
    content: unknown
    type: LogType
    options?: DatadogOptions
  }) {
    return datadogLog({
      ctx: this.ctx,
      textReference: params.title,
      content: params.content,
      type: params.type,
      options: params.options,
    })
  }

  private local = (title: string, content: unknown, type: LogType) => {
    const color = type === 'ERROR' ? '31' : '36'

    // eslint-disable-next-line no-console
    console.info(`\x1b[${color}m`, title, content)
  }

  public isEnabled = () => {
    return this.enabled
  }
}
