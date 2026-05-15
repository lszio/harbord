/**
 * Represents the possible operational statuses of a runtime service.
 */
export type RuntimeStatus =
  | 'idle'      // Not yet started
  | 'starting'  // In the process of starting
  | 'running'   // Running and healthy
  | 'unhealthy' // Running but failing conditions/heartbeats
  | 'stopping'  // In the process of stopping
  | 'stopped'   // Gracefully stopped
  | 'crashed'   // Unexpectedly exited

/**
 * The actual, observed state of a runtime service at a point in time.
 */
export interface RuntimeState {
  /** The unique ID of the runtime. */
  id?: string
  /** The current status of the service. */
  status: RuntimeStatus
  /** The process ID, if available and applicable. */
  pid?: number
  /** Timestamp when the service was last started. */
  startedAt?: number
  /** Dynamic metadata exposed by the service itself or by the supervisor. */
  metadata?: Record<string, unknown>
}
