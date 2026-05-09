import { SocketClient } from '../ipc/socket-client'
import { Registry } from '../daemon/registry'
import { connectOrBootstrap } from '../daemon/bootstrap'
import { RuntimeServiceProxy, specsMatch } from '../runtime/runtime-service-proxy'
import { DaemonControl } from './daemon-control'
import { Self } from './self'
import type { RuntimeSpec } from '../core/runtime-spec'

export class Harbor {
  private _client: SocketClient | null = null
  private _daemon: DaemonControl | null = null

  constructor() {}

  get connected(): boolean {
    return this._client?.isConnected ?? false
  }

  /** Access daemon control (status, stop). */
  get daemon(): DaemonControl {
    if (!this._daemon) {
      throw new Error('Not connected. Call connect() first.')
    }
    return this._daemon
  }

  /**
   * Ensure connection to the daemon, auto-bootstrapping if needed.
   */
  async connect(registry?: Registry): Promise<void> {
    const reg = registry ?? new Registry()
    await reg.init()
    this._client = await connectOrBootstrap(reg)
    this._daemon = new DaemonControl(this._client)
  }

  /**
   * Negotiate a runtime service by name.
   *
   * If a runtime with the given id already exists and its spec differs,
   * returns a *conflicted* proxy. The caller can inspect `.conflicted`
   * and choose a recovery strategy: attach(), replace(), or ignore().
   */
  async service(id: string, spec?: RuntimeSpec): Promise<RuntimeServiceProxy> {
    await this.ensureConnected()

    const proxy = new RuntimeServiceProxy(this._client!, id)

    if (spec) {
      const existingSpec = await this._client!.request<RuntimeSpec | null>(
        'runtime.get-spec',
        { id },
      )

      if (existingSpec && !specsMatch(existingSpec, spec)) {
        proxy.markConflicted(existingSpec, spec)
        return proxy
      }

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
    await this._client!.request('self.register', { id: runtimeId })
    return new Self(this._client!, runtimeId)
  }

  /**
   * Disconnect from the daemon.
   */
  async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.close()
      this._client = null
    }
    this._daemon = null
  }

  private async ensureConnected(): Promise<void> {
    if (!this._client || !this._client.isConnected) {
      await this.connect()
    }
  }
}
