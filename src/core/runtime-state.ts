export type RuntimeStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'stopping'
  | 'stopped'
  | 'crashed'

export interface RuntimeState {
  id?: string
  status: RuntimeStatus
  pid?: number
  startedAt?: number
  metadata?: Record<string, unknown>
}
