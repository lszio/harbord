import { SocketClient } from '../ipc/socket-client'

/**
 * Handle for a worker process to communicate its status back to the Harbord supervisor.
 *
 * Worker processes should use this API to send heartbeats, expose metadata (like ports),
 * and signal graceful shutdown.
 */
export class Self {
  private running = true

  constructor(
    private client: SocketClient,
    private runtimeId: string,
  ) {}

  /**
   * The unique ID of the current runtime as registered in Harbord.
   */
  get id(): string {
    return this.runtimeId
  }

  /**
   * Expose dynamic metadata about the current process to Harbord.
   * This metadata can then be discovered by other clients using the SDK.
   *
   * @example
   * ```typescript
   * await self.expose({ port: 3000, version: '1.2.3' });
   * ```
   *
   * @param metadata - A key-value map of metadata to expose.
   */
  async expose(metadata: Record<string, unknown>): Promise<void> {
    await this.client.request('self.expose', {
      id: this.runtimeId,
      metadata,
    })
  }

  /**
   * Send a heartbeat signal to the supervisor to indicate the process is still alive and healthy.
   * If heartbeats stop being received, the supervisor may mark the service as unhealthy or restart it.
   */
  async alive(): Promise<void> {
    if (!this.running) return
    await this.client.request('self.alive', {
      id: this.runtimeId,
      timestamp: Date.now(),
    })
  }

  /**
   * Signals that the process is initiating a graceful shutdown.
   * This tells Harbord not to treat the subsequent process exit as a crash.
   */
  async shutdown(): Promise<void> {
    this.running = false
    // Implementation of self.shutdown on the daemon side is TBD,
    // but we mark it as not running locally.
  }
}
