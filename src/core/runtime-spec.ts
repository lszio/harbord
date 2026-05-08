import type { RuntimeState } from './runtime-state'

export interface RuntimeCondition {
  type: string
  check(spec: RuntimeSpec, state: RuntimeState): Promise<boolean>
}

export interface RuntimeSpec {
  id: string
  revision?: string
  entry?: string
  args?: string[]
  env?: Record<string, string>
  singleton?: boolean
  backend?: {
    type: string
  }
  owner?: {
    type: string
    id: string
  }
  conditions?: RuntimeCondition[]
}
