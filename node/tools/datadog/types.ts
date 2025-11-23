export interface LogBody {
  ddsource?: string
  ddtags?: string
  hostname: string
  service: string
  message: string
  status: string
  timestamp?: string
  trace_id?: string
  env: string
  version: string
  operationId: string
  account: string
  content: unknown
  http?: Http
  source?: string
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
