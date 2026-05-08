import type { RuntimeSpec } from '../core/runtime-spec'
import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeEvent } from '../core/runtime-event'

export interface RuntimeBackend {
  ensure(spec: RuntimeSpec): Promise<void>
  stop(id: string): Promise<void>
  remove(id: string): Promise<void>
  inspect(id: string): Promise<RuntimeState>
  logs(id: string): AsyncIterable<RuntimeEvent>
}
