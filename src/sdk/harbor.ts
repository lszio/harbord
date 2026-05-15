import { SocketClient } from '../ipc/socket-client'
import { Registry } from '../daemon/registry'
import { connectOrBootstrap } from '../daemon/bootstrap'
import { RuntimeServiceProxy, specsMatch } from '../runtime/runtime-service-proxy'
import { DaemonControl, type ClientProvider } from './daemon-control'
import { Self } from './self'
import type { RuntimeSpec } from '../core/runtime-spec'

/**
 * Configuration options for the Harbor SDK.
 */
export interface HarborOptions {
  /**
   * Base directory for harbord state, sockets, and logs.
   * Defaults to $HARBORD_HOME or ~/.harbord
   */
  home?: string
  /**
   * Whether to automatically start the daemon if it's not currently running.
   * Defaults to true.
   */
  autoBootstrap?: boolean
  /**
   * Timeout in milliseconds for waiting for the daemon to start and its socket to become ready.
   * Defaults to 5000ms.
   */
  timeout?: number
  /**
   * Path to the harbord CLI entry point.
   * Used for auto-bootstrapping if the default detection fails.
   */
  daemonEntry?: string
}

/**
 * The main entry point for the Harbord SDK.
 * Provides methods to manage services, interact with the daemon, and perform self-registration.
 *
 * @example
 * ```typescript
 * const harbor = new Harbor();
 * const svc = await harbor.service('my-api', { entry: './server.js' });
 * console.log(`Service status: ${svc.state?.status}`);
 * ```
 */
export class Harbor implements ClientProvider {
  private _client: SocketClient | null = null
  private _daemon: DaemonControl | null = null
  private _registry: Registry | null = null

  constructor(private options: HarborOptions = {}) {}

  /**
   * Indicates whether the SDK is currently connected to the Harbord daemon.
   */
  get connected(): boolean {
    return this._client?.isConnected ?? false
  }

  /**
   * Access daemon-level control operations like getting status or stopping the daemon.
   */
  get daemon(): DaemonControl {
    if (!this._daemon) {
      this._daemon = new DaemonControl(this)
    }
    return this._daemon
  }

  /**
   * Explicitly ensures a connection to the Harbord daemon, auto-bootstrapping it if necessary.
   * Most methods (like `service` or `self`) will call this automatically.
   *
   * @param registry - Optional registry instance to use.
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
   * Negotiates a runtime service by its unique ID.
   *
   * If a service with the same ID is already running:
   * - If the specs match, it attaches to the existing service.
   * - If the specs differ, it returns a *conflicted* proxy, allowing the user to decide
   *   whether to `attach()`, `replace()`, or `ignore()`.
   *
   * @param id - The unique identifier for the service.
   * @param spec - The desired state specification for the service.
   * @returns A proxy object representing the live runtime service.
   */
  async service(
    id: string,
    spec?: Omit<RuntimeSpec, 'id'> & { id?: string },
  ): Promise<RuntimeServiceProxy> {
    const client = await this.getClient()
    const proxy = new RuntimeServiceProxy(client, id)

    if (spec) {
      const fullSpec = { ...spec, id } as RuntimeSpec
      const existingSpec = await client.request<RuntimeSpec | null>(
        'runtime.get-spec',
        { id },
      )

      if (existingSpec && !specsMatch(existingSpec, fullSpec)) {
        proxy.markConflicted(existingSpec, fullSpec)
        return proxy
      }

      await proxy.up(fullSpec)
    } else {
      await proxy.refresh()
    }

    return proxy
  }

  /**
   * Gets a handle for the current process to register itself with Harbord.
   * This is typically used by worker processes running *inside* Harbord.
   *
   * @param runtimeId - The ID this process should identify as.
   * @returns A Self handle for heartbeats and metadata exposure.
   */
  async self(runtimeId: string): Promise<Self> {
    const client = await this.getClient()
    await client.request('self.register', { id: runtimeId })
    return new Self(client, runtimeId)
  }

  /**
   * Disconnects the SDK from the Harbord daemon socket.
   */
  async disconnect(): Promise<void> {
    if (this._client) {
      await this._client.close()
      this._client = null
    }
  }

  /**
   * Internal helper to ensure connection and return the active IPC client.
   * Implements the `ClientProvider` interface.
   */
  async getClient(): Promise<SocketClient> {
    if (!this._client || !this._client.isConnected) {
      await this.connect()
    }
    return this._client!
  }
}
