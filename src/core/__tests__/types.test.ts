import { describe, it, expect } from 'vitest'
import type { RuntimeCondition } from '../runtime-spec'
import type { RuntimeSpec } from '../runtime-spec'
import type { RuntimeState, RuntimeStatus } from '../runtime-state'
import type { RuntimeEvent } from '../runtime-event'

describe('RuntimeStatus', () => {
  const statuses: RuntimeStatus[] = [
    'idle',
    'starting',
    'running',
    'unhealthy',
    'stopping',
    'stopped',
    'crashed',
  ]

  it('should have all defined statuses', () => {
    expect(statuses).toHaveLength(7)
  })

  it.each(statuses)('status %s should be valid', (status) => {
    const state: RuntimeState = { status }
    expect(state.status).toBe(status)
  })
})

describe('RuntimeState', () => {
  it('should create a minimal state', () => {
    const state: RuntimeState = { status: 'idle' }
    expect(state.status).toBe('idle')
    expect(state.pid).toBeUndefined()
    expect(state.startedAt).toBeUndefined()
  })

  it('should create a full state', () => {
    const state: RuntimeState = {
      status: 'running',
      pid: 12345,
      startedAt: Date.now(),
      metadata: { port: 8080 },
    }
    expect(state.pid).toBe(12345)
    expect(state.metadata?.port).toBe(8080)
  })
})

describe('RuntimeSpec', () => {
  it('should create a minimal spec', () => {
    const spec: RuntimeSpec = { id: 'test-service' }
    expect(spec.id).toBe('test-service')
    expect(spec.singleton).toBeUndefined()
  })

  it('should create a full spec', () => {
    const spec: RuntimeSpec = {
      id: 'my-service',
      revision: 'abc123',
      entry: './server.ts',
      args: ['--port', '3000'],
      env: { NODE_ENV: 'production' },
      singleton: true,
      backend: { type: 'node-process' },
      owner: { type: 'plugin', id: 'theia-bridge' },
    }
    expect(spec.entry).toBe('./server.ts')
    expect(spec.singleton).toBe(true)
    expect(spec.owner?.id).toBe('theia-bridge')
  })
})

describe('RuntimeEvent', () => {
  it('should create a runtime event', () => {
    const event: RuntimeEvent = {
      type: 'runtime.started',
      source: 'test',
      timestamp: 1000,
      payload: { pid: 123 },
    }
    expect(event.type).toBe('runtime.started')
    expect(event.payload).toEqual({ pid: 123 })
  })

  it('should allow null payload', () => {
    const event: RuntimeEvent = {
      type: 'runtime.stopped',
      source: 'test',
      timestamp: 2000,
    }
    expect(event.payload).toBeUndefined()
  })
})

describe('RuntimeCondition interface', () => {
  it('should have the correct shape', () => {
    const condition: RuntimeCondition = {
      type: 'plugin-installed',
      async check() {
        return true
      },
    }
    expect(condition.type).toBe('plugin-installed')
  })
})
