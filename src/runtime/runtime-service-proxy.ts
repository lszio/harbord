import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeSpec } from '../core/runtime-spec'
import { SocketClient } from '../ipc/socket-client'
import { IpcMethod } from '../ipc/protocol'

/**
 * Compare two specs to determine if they describe the same runtime.
 * Checks entry, args, and env — changes to these constitute a different runtime.
 */
export function specsMatch(a: RuntimeSpec, b: RuntimeSpec): boolean {
  if (a.entry !== b.entry) return false
  if (JSON.stringify(a.args ?? []) !== JSON.stringify(b.args ?? [])) return false
  if (JSON.stringify(a.env ?? {}) !== JSON.stringify(b.env ?? {})) return false
  return true
}

export class RuntimeServiceProxy {
  private _state: RuntimeState | null = null
  private _conflicted = false
  private _existingSpec: RuntimeSpec | null = null
  private _requestedSpec: RuntimeSpec | null = null

  constructor(
    private client: SocketClient,
    public readonly id: string,
  ) {}

  get state(): RuntimeState | null {
    return this._state
  }

  get pid(): number | undefined {
    return this._state?.pid
  }

  get meta(): Record<string, unknown> | undefined {
    return this._state?.metadata
  }

  get conflicted(): boolean {
    return this._conflicted
  }

  get existingSpec(): RuntimeSpec | null {
    return this._existingSpec
  }

  get requestedSpec(): RuntimeSpec | null {
    return this._requestedSpec
  }

  /** Mark this proxy as conflicted (called by Harbor.service()). */
  markConflicted(existing: RuntimeSpec, requested: RuntimeSpec): void {
    this._conflicted = true
    this._existingSpec = existing
    this._requestedSpec = requested
  }

  /** Attach to the existing runtime despite a spec mismatch. */
  async attach(): Promise<RuntimeState | null> {
    this._conflicted = false
    const result = await this.client.request<RuntimeState | null>(
      IpcMethod.RuntimeInspect,
      { id: this.id },
    )
    this._state = result
    return result
  }

  /** Replace the existing runtime with the requested spec. */
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

  /** Acknowledge the conflict and keep the existing runtime unchanged. */
  ignore(): void {
    this._conflicted = false
  }

  async up(spec: RuntimeSpec): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(
      IpcMethod.RuntimeStart,
      spec as unknown,
    )
    this._state = result
    return result
  }

  async down(): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(
      IpcMethod.RuntimeStop,
      { id: this.id },
    )
    this._state = result
    return result
  }

  async refresh(): Promise<RuntimeState | null> {
    const result = await this.client.request<RuntimeState | null>(
      IpcMethod.RuntimeInspect,
      { id: this.id },
    )
    this._state = result
    return result
  }
}
