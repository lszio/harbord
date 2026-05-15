import { SocketClient } from '../ipc/socket-client'
import { IpcMethod } from '../ipc/protocol'

/**
 * Information about the running Harbord daemon.
 */
export interface DaemonInfo {
  /** The process ID of the daemon. */
  pid: number
  /** Uptime in milliseconds. */
  uptime: number
  /** Timestamp when the daemon was started. */
  startedAt: number
  /** Whether the reconciler loop is currently active. */
  reconcilerRunning: boolean
  /** Number of currently running services. */
  runtimes: number
  /** List of all registered runtime IDs. */
  registered: string[]
}

/**
 * Interface for something that can provide a connected SocketClient.
 * This allows DaemonControl to lazily ensure connection.
 */
export interface ClientProvider {
  /**
   * Returns a promise that resolves to a connected SocketClient.
   */
  getClient(): Promise<SocketClient>
}

/**
 * Provides administrative control over the Harbord daemon process.
 */
export class DaemonControl {
  constructor(private provider: SocketClient | ClientProvider) {}

  /**
   * Retrieves current status and resource usage information from the daemon.
   */
  async status(): Promise<DaemonInfo> {
    const client = await this.ensureClient()
    return client.request<DaemonInfo>(IpcMethod.DaemonStatus)
  }

  /**
   * Gracefully shuts down the Harbord daemon and all services it is supervising.
   *
   * @returns An object indicating the shutdown status.
   */
  async stop(): Promise<{ shuttingDown: boolean }> {
    const client = await this.ensureClient()
    return client.request<{ shuttingDown: boolean }>(IpcMethod.DaemonShutdown)
  }

  private async ensureClient(): Promise<SocketClient> {
    if (this.provider instanceof SocketClient) {
      return this.provider
    }
    return this.provider.getClient()
  }
}
