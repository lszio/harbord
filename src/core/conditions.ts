import { access } from 'node:fs/promises'
import type { RuntimeCondition, RuntimeSpec } from './runtime-spec'
import type { RuntimeState } from './runtime-state'

/**
 * Condition that checks if a file exists.
 * If the file is missing, the condition is false.
 */
export class FileExistsCondition implements RuntimeCondition {
  readonly type = 'file-exists'

  constructor(private path: string) {}

  async check(_spec: RuntimeSpec, _state: RuntimeState): Promise<boolean> {
    try {
      await access(this.path)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Condition that checks if a network port is reachable.
 * (Future implementation)
 */
export class PortReachableCondition implements RuntimeCondition {
  readonly type = 'port-reachable'
  constructor(private port: number, private host = 'localhost') {}
  async check(): Promise<boolean> {
    // TODO: Implement port check logic
    return true
  }
}
