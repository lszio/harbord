import type { RuntimeSpec } from '../core/runtime-spec'
import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeEvent } from '../core/runtime-event'
import type { RuntimeBackend } from '../backend/runtime-backend'
import type { Registry } from '../daemon/registry'

export class RuntimeService {
  private specs = new Map<string, RuntimeSpec>()
  private states = new Map<string, RuntimeState>()

  constructor(
    private backend: RuntimeBackend,
    private registry: Registry,
  ) {}

  async start(spec: RuntimeSpec): Promise<RuntimeState> {
    const existing = this.states.get(spec.id)
    if (existing && existing.status === 'running') {
      // If spec revision changed, restart
      if (spec.revision && spec.revision !== this.specs.get(spec.id)?.revision) {
        await this.stop(spec.id)
      } else {
        return existing
      }
    }

    this.specs.set(spec.id, spec)

    const starting: RuntimeState = { status: 'starting' }
    this.states.set(spec.id, starting)
    await this.registry.saveState(spec.id, starting)

    try {
      await this.backend.ensure(spec)

      const state: RuntimeState = await this.backend.inspect(spec.id)

      // Process exited before we could observe it running
      if (state.status !== 'running') {
        const crashed: RuntimeState = {
          status: 'crashed',
          startedAt: state.startedAt,
          pid: state.pid,
        }
        this.states.set(spec.id, crashed)
        await this.registry.saveState(spec.id, crashed)
        return crashed
      }

      this.states.set(spec.id, state)
      await this.registry.saveState(spec.id, state)

      return state
    } catch (error) {
      const crashed: RuntimeState = {
        status: 'crashed',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      }
      this.states.set(spec.id, crashed)
      await this.registry.saveState(spec.id, crashed)
      return crashed
    }
  }

  async stop(id: string): Promise<RuntimeState> {
    const stopping: RuntimeState = { status: 'stopping' }
    this.states.set(id, stopping)
    await this.registry.saveState(id, stopping)

    await this.backend.stop(id)

    const stopped: RuntimeState = { status: 'stopped' }
    this.states.set(id, stopped)
    await this.registry.saveState(id, stopped)
    this.specs.delete(id)

    return stopped
  }

  async inspect(id: string): Promise<RuntimeState | null> {
    // Check if backend has more recent state
    const backendState = await this.backend.inspect(id)
    if (backendState.status !== 'idle') {
      this.states.set(id, backendState)
      return backendState
    }

    // Fall back to in-memory, then registry
    return this.states.get(id) ?? this.registry.loadState(id)
  }

  logs(id: string): AsyncIterable<RuntimeEvent> {
    return this.backend.logs(id)
  }

  getSpec(id: string): RuntimeSpec | undefined {
    return this.specs.get(id)
  }

  listRunning(): string[] {
    const running: string[] = []
    for (const [id, state] of this.states) {
      if (state.status === 'running' || state.status === 'starting') {
        running.push(id)
      }
    }
    return running
  }
}
