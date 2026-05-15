import type { RuntimeState } from './runtime-state'

/**
 * Interface representing a condition that must be met for a runtime to be considered healthy
 * or for the reconciler to take action.
 */
export interface RuntimeCondition {
  /** The type of condition (e.g., 'file-exists', 'port-reachable'). */
  type: string
  /**
   * Evaluates the condition.
   *
   * @param spec - The runtime specification.
   * @param state - The current runtime state.
   * @returns A promise that resolves to true if the condition is satisfied.
   */
  check(spec: RuntimeSpec, state: RuntimeState): Promise<boolean>
}

/**
 * The declarative specification (desired state) of a runtime service.
 */
export interface RuntimeSpec {
  /**
   * The unique identifier for the runtime.
   */
  id: string

  /**
   * Optional revision string. If changed, the supervisor will restart the service.
   */
  revision?: string

  /**
   * Path to the script or binary to execute.
   */
  entry?: string

  /**
   * Command-line arguments to pass to the process.
   */
  args?: string[]

  /**
   * Environment variables to set for the process.
   */
  env?: Record<string, string>

  /**
   * If true, Harbord ensures only one instance of this runtime exists across all clients.
   * Defaults to false (though many Harbord use cases imply singleton behavior).
   */
  singleton?: boolean

  /**
   * Configuration for the execution backend.
   */
  backend?: {
    /** The type of backend (e.g., 'node-process', 'systemd'). */
    type: string
  }

  /**
   * Information about the owner of this runtime, used for automated cleanup.
   */
  owner?: {
    /** The type of owner (e.g., 'plugin', 'user'). */
    type: string
    /** Unique ID of the owner. */
    id: string
  }

  /**
   * A list of conditions that must be maintained. The reconciler will periodically check these.
   */
  conditions?: RuntimeCondition[]
}
