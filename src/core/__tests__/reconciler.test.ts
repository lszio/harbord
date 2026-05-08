import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Reconciler } from '../reconciler'
import type { RuntimeSpec } from '../runtime-spec'
import type { RuntimeState } from '../runtime-state'

function mockService(overrides?: Partial<ReturnType<typeof createMockService>>) {
  const defaults = createMockService()
  return { ...defaults, ...overrides }
}

function createMockService() {
  const specs = new Map<string, RuntimeSpec>()
  const states = new Map<string, RuntimeState>()

  return {
    states,
    specs,
    listRunning: vi.fn(() => Array.from(specs.keys())),
    getSpec: vi.fn((id: string) => specs.get(id)),
    inspect: vi.fn(async (id: string) => states.get(id) ?? null),
    start: vi.fn(async (spec: RuntimeSpec) => {
      specs.set(spec.id, spec)
      states.set(spec.id, { status: 'running', pid: 999 })
      return states.get(spec.id)!
    }),
    stop: vi.fn(async (id: string) => {
      specs.delete(id)
      states.set(id, { status: 'stopped' })
      return states.get(id)!
    }),
  }
}

describe('Reconciler', () => {
  let service: ReturnType<typeof createMockService>
  let reconciler: Reconciler

  beforeEach(() => {
    service = createMockService()
    reconciler = new Reconciler(service as any, 100)
  })

  afterEach(() => {
    reconciler.stop()
  })

  it('should start and stop', () => {
    expect(reconciler.running).toBe(false)
    reconciler.start()
    expect(reconciler.running).toBe(true)
    reconciler.stop()
    expect(reconciler.running).toBe(false)
  })

  it('should restart a crashed runtime', async () => {
    const spec: RuntimeSpec = { id: 'svc', entry: 'test.js' }
    service.start(spec)
    service.states.set('svc', { status: 'crashed' })

    reconciler.start()
    await vi.waitFor(() => {
      expect(service.start).toHaveBeenCalledTimes(2)
    }, { timeout: 1000 })
    reconciler.stop()
  })

  it('should NOT restart a stopped runtime', async () => {
    const spec: RuntimeSpec = { id: 'svc', entry: 'test.js' }
    service.start(spec)
    service.states.set('svc', { status: 'stopped' })

    reconciler.start()
    // Give the reconciler a tick
    await new Promise((r) => setTimeout(r, 200))
    reconciler.stop()

    // Should not have called start again (only the initial call)
    expect(service.start).toHaveBeenCalledTimes(1)
  })

  it('should stop a runtime when a condition fails', async () => {
    const spec: RuntimeSpec = {
      id: 'svc',
      entry: 'test.js',
      conditions: [
        {
          type: 'file-exists',
          async check() {
            return false
          },
        },
      ],
    }

    service.start(spec)
    service.states.set('svc', { status: 'running' })

    reconciler.start()
    await vi.waitFor(() => {
      expect(service.stop).toHaveBeenCalledWith('svc')
    }, { timeout: 1000 })
    reconciler.stop()
  })

  it('should not restart if spec is missing', async () => {
    // Runtime running but no spec (shouldn't happen, but be safe)
    service.states.set('orphan', { status: 'crashed' })

    reconciler.start()
    await new Promise((r) => setTimeout(r, 200))
    reconciler.stop()

    expect(service.start).not.toHaveBeenCalled()
  })

  it('should handle condition check throwing', async () => {
    const spec: RuntimeSpec = {
      id: 'svc',
      entry: 'test.js',
      conditions: [
        {
          type: 'throwing',
          async check() {
            throw new Error('fail')
          },
        },
      ],
    }

    service.start(spec)
    service.states.set('svc', { status: 'running' })

    reconciler.start()
    await vi.waitFor(() => {
      expect(service.stop).toHaveBeenCalledWith('svc')
    }, { timeout: 1000 })
    reconciler.stop()
  })
})
