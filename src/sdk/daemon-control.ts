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

export class DaemonControl {
  constructor(private client: SocketClient) {}

  /** Get daemon status and runtime info. */
  async status(): Promise<DaemonInfo> {
    return this.client.request<DaemonInfo>(IpcMethod.DaemonStatus)
  }

  /** Gracefully shut down the daemon and all runtimes. */
  async stop(): Promise<{ shuttingDown: boolean }> {
    return this.client.request<{ shuttingDown: boolean }>(IpcMethod.DaemonShutdown)
  }
}
