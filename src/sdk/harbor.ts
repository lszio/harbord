import { SocketClient } from '../ipc/socket-client'
import { Registry } from '../daemon/registry'
import { connectOrBootstrap } from '../daemon/bootstrap'
import { RuntimeServiceProxy, specsMatch } from '../runtime/runtime-service-proxy'
import { DaemonControl, type ClientProvider } from './daemon-control'
import { Self } from './self'
import type { RuntimeSpec } from '../core/runtime-spec'

export interface HarborOptions {
  /** Base directory for harbord state and socket. Defaults to HARBORD_HOME or ~/.harbord */
  home?: string
  /** Whether to automatically start the daemon if not running. Defaults to true. */
  autoBootstrap?: boolean
  /** Timeout for waiting for the daemon to start (ms). */
  timeout?: number
  /** Path to the harbord CLI entry point. Used for auto-bootstrapping. */
  daemonEntry?: string
}

export class Harbor implements ClientProvider {
  private _client: SocketClient | null = null
  private _daemon: DaemonControl | null = null
  private _registry: Registry | null = null

  constructor(private options: HarborOptions = {}) {}

  get connected(): boolean {
    return this._client?.isConnected ?? false
  }

  /** Access daemon control (status, stop). */
  get daemon(): DaemonControl {
    if (!this._daemon) {
      this._daemon = new DaemonControl(this)
    }
    return this._daemon
  }

  /**
   * Ensure connection to the daemon, auto-bootstrapping if needed.
   */
  async connect(registry?: Registry): Promise<void> {
    if (registry) {
      this._registry = registry
    }

    if (!this._registry) {
      this._registry = new Registry(this.options.home)
      await this._registry.init()
    }

    this._client = await connectOrBootstrap(this._registry, {
      timeout: this.options.timeout,
      autoBootstrap: this.options.autoBootstrap ?? true,
      daemonEntry: this.options.daemonEntry,
    })
  }

  /**
   * Negotiate a runtime service by name.
   *
   * If a runtime with the given id already exists and its spec differs,
   * returns a *conflicted* proxy. The caller can inspect `.conflicted`
   * and choose a recovery strategy: attach(), replace(), or ignore().
   */
  async service(id: string, spec?: RuntimeSpec): Promise<RuntimeServiceProxy> {
    const client = await this.getClient()
    const proxy = new RuntimeServiceProxy(client, id)

    if (spec) {
      const existingSpec = await client.request<RuntimeSpec | null>(
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
    const client = await this.getClient()
    await client.request('self.register', { id: runtimeId })
    return new Self(client, runtimeId)
  }

  /**
   * Disconnect from the daemon.
   */
  async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.close()
      this._client = null
    }
  }

  /**
   * Implements ClientProvider.
   * Ensures connection and returns the SocketClient.
   */
  async getClient(): Promise<SocketClient> {
    if (!this._client || !this._client.isConnected) {
      await this.connect()
    }
    return this._client!
  }
}
