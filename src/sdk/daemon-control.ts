import { SocketClient } from '../ipc/socket-client'
import { IpcMethod } from '../ipc/protocol'

export interface DaemonInfo {
  pid: number
  uptime: number
  startedAt: number
  reconcilerRunning: boolean
  runtimes: number
  registered: string[]
}

/**
 * Interface for something that can provide a connected SocketClient.
 * This allows DaemonControl to lazily ensure connection.
 */
export interface ClientProvider {
  getClient(): Promise<SocketClient>
}

export class DaemonControl {
  constructor(private provider: SocketClient | ClientProvider) {}

  /** Get daemon status and runtime info. */
  async status(): Promise<DaemonInfo> {
    const client = await this.ensureClient()
    return client.request<DaemonInfo>(IpcMethod.DaemonStatus)
  }

  /** Gracefully shut down the daemon and all runtimes. */
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
