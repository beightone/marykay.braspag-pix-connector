export interface LogBody {
  source: string
  env: string
  version: string
  hostname: string
  message: string
  service: string
  status: LogType
  operationId: string
  account: string
  content: unknown
  http?: Http
  trace_id: string
  metadata?: Record<string, unknown>
}

export interface Http {
  url?: string
  status_code?: number | string | undefined
  method?: string
  referer?: string
  request_id?: string | number | boolean
  useragent?: string | number | boolean
  version?: string
  url_details: {
    host?: string
    port?: string
    path?: string
    queryString?: string
    scheme?: string
  }
}

export type DatadogOptions = {
  trackerId?: string
  metadata?: Record<string, unknown>
}

export type LogType = 'INFO' | 'WARN' | 'ERROR'
