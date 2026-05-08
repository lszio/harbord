import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeSpec } from '../core/runtime-spec'
import { SocketClient } from '../ipc/socket-client'
import { IpcMethod } from '../ipc/protocol'

export class RuntimeServiceProxy {
  private _state: RuntimeState | null = null

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

  async up(spec: RuntimeSpec): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(IpcMethod.RuntimeStart, spec)
    this._state = result
    return result
  }

  async down(): Promise<RuntimeState> {
    const result = await this.client.request<RuntimeState>(IpcMethod.RuntimeStop, { id: this.id })
    this._state = result
    return result
  }

  async refresh(): Promise<RuntimeState | null> {
    const result = await this.client.request<RuntimeState | null>(IpcMethod.RuntimeInspect, {
      id: this.id,
    })
    this._state = result
    return result
  }
}
