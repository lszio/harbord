import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { NodeProcessBackend } from '../node-process-backend'
import type { RuntimeSpec } from '../../core/runtime-spec'

const echoServer = join(import.meta.dirname, 'helpers', 'echo-server.cjs')

describe('NodeProcessBackend', () => {
  let backend: NodeProcessBackend

  beforeEach(() => {
    backend = new NodeProcessBackend()
  })

  afterEach(async () => {
    // Clean up any remaining processes
    for (const id of ['test-svc', 'test-svc-2']) {
      await backend.remove(id).catch(() => {})
    }
  })

  describe('ensure', () => {
    it('should start a process', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)

      const state = await backend.inspect('test-svc')
      expect(state.status).toBe('running')
      expect(state.pid).toBeGreaterThan(0)
    })

    it('should be idempotent when called twice', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)
      const state1 = await backend.inspect('test-svc')
      await backend.ensure(spec)
      const state2 = await backend.inspect('test-svc')

      expect(state1.pid).toBe(state2.pid)
    })

    it('should throw if no entry point', async () => {
      const spec: RuntimeSpec = { id: 'no-entry' }
      await expect(backend.ensure(spec)).rejects.toThrow('has no entry point')
    })
  })

  describe('stop', () => {
    it('should stop a running process', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)
      await backend.stop('test-svc')

      const state = await backend.inspect('test-svc')
      expect(['stopped', 'idle']).toContain(state.status)
    })

    it('should be safe to stop a non-existent process', async () => {
      await expect(backend.stop('non-existent')).resolves.not.toThrow()
    })
  })

  describe('inspect', () => {
    it('should return idle for non-existent process', async () => {
      const state = await backend.inspect('non-existent')
      expect(state.status).toBe('idle')
    })

    it('should return running after ensure', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)

      const state = await backend.inspect('test-svc')
      expect(state.status).toBe('running')
      expect(state.pid).toBeGreaterThan(0)
      expect(state.startedAt).toBeGreaterThan(0)
    })
  })

  describe('logs', () => {
    it('should capture stdout', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)

      const logs: string[] = []
      for await (const event of backend.logs('test-svc')) {
        if (event.type === 'runtime.log') {
          const payload = event.payload as { stream: string; line: string }
          logs.push(`[${payload.stream}] ${payload.line}`)
        } else {
          logs.push(`[${event.type}] ${JSON.stringify(event.payload)}`)
        }
        if (logs.length >= 5) break
      }

      expect(logs.some((l) => l.includes('alive'))).toBe(true)
    })
  })

  describe('remove', () => {
    it('should stop and cleanup', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await backend.ensure(spec)
      await backend.remove('test-svc')

      const state = await backend.inspect('test-svc')
      expect(['stopped', 'idle']).toContain(state.status)
    })
  })
})
