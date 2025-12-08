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

    this.enabled = ctx.vtex?.workspace !== 'master'

    this.local(
      '[DATADOG] Logger initialized',
      {
        workspace: ctx.vtex?.workspace,
        enabled: this.enabled,
      },
      'INFO'
    )
  }

  private async catchError(data: unknown) {
    try {
      const result = await this.datadog.save(data)

      this.local(
        '[DATADOG] Log sent successfully',
        { workspace: this.ctx.vtex?.workspace, enabled: this.enabled },
        'INFO'
      )

      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const errorStack = err instanceof Error ? err.stack : undefined

      this.local(
        '[DATADOG] Failed to send log',
        {
          workspace: this.ctx.vtex?.workspace,
          enabled: this.enabled,
          error: errorMessage,
          stack: errorStack,
        },
        'ERROR'
      )
    }
  }

  public parsedLog = (title: string, content: unknown) => {
    return this.local(
      'PARSED_LOG',
      this.parseData({ title, content, type: 'INFO' }),
      'INFO'
    )
  }

  public info = (
    title: string,
    content?: unknown,
    options?: DatadogOptions
  ) => {
    this.local(title, content ?? {}, 'INFO')

    if (!this.enabled) return

    const mergedOptions: DatadogOptions = {
      ...options,
      metadata: {
        ...(typeof content === 'object' && content !== null ? content : {}),
        ...options?.metadata,
      },
    }

    this.catchError(
      this.parseData({
        title,
        content: content ?? {},
        type: 'INFO',
        options: mergedOptions,
      })
    )
  }

  public warn = (
    title: string,
    content?: unknown,
    options?: DatadogOptions
  ) => {
    this.local(title, content ?? {}, 'WARN')

    if (!this.enabled) return

    const mergedOptions: DatadogOptions = {
      ...options,
      metadata: {
        ...(typeof content === 'object' && content !== null ? content : {}),
        ...options?.metadata,
      },
    }

    this.catchError(
      this.parseData({
        title,
        content: content ?? {},
        type: 'WARN',
        options: mergedOptions,
      })
    )
  }

  public error = (
    title: string,
    content?: unknown,
    options?: DatadogOptions
  ) => {
    this.local(title, content ?? {}, 'ERROR')

    if (!this.enabled) return

    const mergedOptions: DatadogOptions = {
      ...options,
      metadata: {
        ...(typeof content === 'object' && content !== null ? content : {}),
        ...options?.metadata,
      },
    }

    this.catchError(
      this.parseData({
        title,
        content: content ?? {},
        type: 'ERROR',
        options: mergedOptions,
      })
    )
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
    const color = type === 'ERROR' ? '31' : type === 'WARN' ? '33' : '36'

    // eslint-disable-next-line no-console
    console.info(`\x1b[${color}m[LOCAL_${type}] ${title}\x1b[0m`, content)
  }

  public isEnabled = () => {
    return this.enabled
  }
}
