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
    await this.registry.saveSpec(spec.id, spec)

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
    
    // We keep the spec even after stop, because it's the "desired state"
    // that might be restarted by the reconciler if conditions match.
    // However, if we explicitly stop it, we might want to mark it as not intended to run.
    // For now, let's keep it in the registry but remove from memory.
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
    const state = this.states.get(id) ?? await this.registry.loadState(id)
    if (state) {
      this.states.set(id, state)
    }
    return state
  }

  logs(id: string): AsyncIterable<RuntimeEvent> {
    return this.backend.logs(id)
  }

  async getSpec(id: string): Promise<RuntimeSpec | null> {
    let spec: RuntimeSpec | null | undefined = this.specs.get(id)
    if (spec === undefined) {
      spec = await this.registry.loadSpec(id)
      if (spec) {
        this.specs.set(id, spec)
      } else {
        spec = null
      }
    }
    return spec
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

  /**
   * List all known runtime IDs (those with state or spec in registry)
   */
  async listAll(): Promise<string[]> {
    return this.registry.listIds()
  }
}
