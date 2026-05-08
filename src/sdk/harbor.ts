import { SocketClient } from '../ipc/socket-client'
import { SocketServer } from '../ipc/socket-server'
import { Registry } from '../daemon/registry'
import { connectOrBootstrap } from '../daemon/bootstrap'
import { RuntimeServiceProxy } from '../runtime/runtime-service-proxy'
import { Self } from './self'
import type { RuntimeSpec } from '../core/runtime-spec'

export class Harbor {
  private client: SocketClient | null = null

  constructor() {}

  /**
   * Ensure connection to the daemon, auto-bootstrapping if needed.
   */
  async connect(registry?: Registry): Promise<void> {
    const reg = registry ?? new Registry()
    await reg.init()
    this.client = await connectOrBootstrap(reg)
  }

  /**
   * Negotiate a runtime service by name.
   */
  async service(id: string, spec?: RuntimeSpec): Promise<RuntimeServiceProxy> {
    await this.ensureConnected()

    const proxy = new RuntimeServiceProxy(this.client!, id)

    if (spec) {
      await proxy.up(spec)
    } else {
      await proxy.refresh()
    }

    return proxy
  }

  /**
   * Get a Self handle for the current runtime worker.
   */
  async self(runtimeId: string): Promise<Self> {
    await this.ensureConnected()
    await this.client!.request('self.register', { id: runtimeId })
    return new Self(this.client!, runtimeId)
  }

  /**
   * Disconnect from the daemon.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this.client) {
      await this.connect()
    }
  }
}
