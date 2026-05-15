import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeSpec } from '../core/runtime-spec'
import { SocketClient } from '../ipc/socket-client'
import { IpcMethod } from '../ipc/protocol'

/**
 * Compare two specs to determine if they describe the same runtime.
 * Checks entry, args, and env — changes to these constitute a different runtime.
 *
 * @param a - The first specification to compare.
 * @param b - The second specification to compare.
 * @returns True if the specifications are functionally identical.
 */
export function specsMatch(a: RuntimeSpec, b: RuntimeSpec): boolean {
  if (a.entry !== b.entry) return false
  if (JSON.stringify(a.args ?? []) !== JSON.stringify(b.args ?? [])) return false
  if (JSON.stringify(a.env ?? {}) !== JSON.stringify(b.env ?? {})) return false
  return true
}

/**
 * A proxy object representing a live runtime service managed by Harbord.
 *
 * This class provides access to the service's current state, metadata, and PID,
 * and allows for lifecycle operations like starting, stopping, and conflict resolution.
 */
export class RuntimeServiceProxy {
  private _state: RuntimeState | null = null
  private _conflicted = false
  private _existingSpec: RuntimeSpec | null = null
  private _requestedSpec: RuntimeSpec | null = null

  constructor(
    private client: SocketClient,
    public readonly id: string,
  ) {}

  /**
   * The current actual state of the service.
   */
  get state(): RuntimeState | null {
    return this._state
  }

  /**
   * The process ID (PID) of the service, if it is currently running.
   */
  get pid(): number | undefined {
    return this._state?.pid
  }

  /**
   * The exposed metadata for this service.
   */
  get meta(): Record<string, unknown> | undefined {
    return this._state?.metadata
  }

  /**
   * Indicates if there is a specification mismatch between the local request
   * and the actual service running in the daemon.
   */
  get conflicted(): boolean {
    return this._conflicted
  }

  /**
   * The specification of the service currently known to the daemon.
   * Only populated if `conflicted` is true.
   */
  get existingSpec(): RuntimeSpec | null {
    return this._existingSpec
  }

  /**
   * The specification that was locally requested.
   * Only populated if `conflicted` is true.
   */
  get requestedSpec(): RuntimeSpec | null {
    return this._requestedSpec
  }

  /**
   * Internal method to mark this proxy as conflicted.
   * @param existing - The spec currently in the daemon.
   * @param requested - The spec requested by the user.
   */
  markConflicted(existing: RuntimeSpec, requested: RuntimeSpec): void {
    this._conflicted = true
    this._existingSpec = existing
    this._requestedSpec = requested
  }

  /**
   * Attaches to the existing service despite a specification mismatch.
   * Resolves the conflict by accepting the daemon's current state.
   *
   * @returns A promise that resolves to the current runtime state.
   */
  async attach(): Promise<RuntimeState | null> {
    this._conflicted = false
    const result = await this.client.request<RuntimeState | null>(
      IpcMethod.RuntimeInspect,
      { id: this.id },
    )
    this._state = result
    return result
  }

  /**
   * Replaces the existing service with the requested specification.
   * Resolves the conflict by stopping the old service and starting the new one.
   *
   * @returns A promise that resolves to the new runtime state.
   */
  async replace(): Promise<RuntimeState> {
    this._conflicted = false
    await this.client.request(IpcMethod.RuntimeStop, { id: this.id })
    const result = await this.client.request<RuntimeState>(
      IpcMethod.RuntimeStart,
      this._requestedSpec as unknown,
    )
    this._state = result
    return result
  }

  /**
   * Acknowledges the conflict and keeps the existing service unchanged.
   * No synchronization with the daemon is performed.
   */
  ignore(): void {
    this._conflicted = false
  }

  /**
   * Ensures the service is running according to the provided specification.
   *
   * @param spec - The specification to apply.
   * @returns A promise that resolves to the runtime state.
   */
  async up(spec: RuntimeSpec): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(
      IpcMethod.RuntimeStart,
      spec as unknown,
    )
    this._state = result
    return result
  }

  /**
   * Stops the service.
   *
   * @returns A promise that resolves to the final runtime state.
   */
  async down(): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(
      IpcMethod.RuntimeStop,
      { id: this.id },
    )
    this._state = result
    return result
  }

  /**
   * Refreshes the local state by querying the daemon.
   *
   * @returns A promise that resolves to the current runtime state.
   */
  async refresh(): Promise<RuntimeState | null> {
    const result = await this.client.request<RuntimeState | null>(
      IpcMethod.RuntimeInspect,
      { id: this.id },
    )
    this._state = result
    return result
  }
}
