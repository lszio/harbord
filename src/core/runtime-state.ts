export type RuntimeStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'unhealthy'
  | 'stopping'
  | 'stopped'
  | 'crashed'

export interface RuntimeState {
  status: RuntimeStatus
  pid?: number
  startedAt?: number
  metadata?: Record<string, unknown>
}
