import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeService } from '../runtime-service'
import { NodeProcessBackend } from '../../backend/node-process-backend'
import { Registry } from '../../daemon/registry'
import type { RuntimeSpec } from '../../core/runtime-spec'

const echoServer = join(import.meta.dirname, '..', '..', 'backend', '__tests__', 'helpers', 'echo-server.cjs')
const crashHelper = join(import.meta.dirname, '..', '..', 'backend', '__tests__', 'helpers', 'crash-immediately.cjs')

describe('RuntimeService', () => {
  let backend: NodeProcessBackend
  let registry: Registry
  let service: RuntimeService
  let baseDir: string

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-rt-test-'))
    backend = new NodeProcessBackend()
    registry = new Registry(baseDir)
    await registry.init()
    service = new RuntimeService(backend, registry)
  })

  afterEach(async () => {
    for (const id of ['test-svc', 'crash-svc', 'persist-svc']) {
      await service.stop(id).catch(() => {})
    }
    await rm(baseDir, { recursive: true, force: true })
  })

  describe('start', () => {
    it('should start a runtime', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      const state = await service.start(spec)

      expect(state.status).toBe('running')
      expect(state.pid).toBeGreaterThan(0)
      expect(state.startedAt).toBeGreaterThan(0)
    })

    it('should return existing state when already running', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await service.start(spec)
      const state2 = await service.start(spec)

      expect(state2.status).toBe('running')
    })

    it('should restart if revision changed', async () => {
      const spec1: RuntimeSpec = { id: 'test-svc', entry: echoServer, revision: 'a' }
      const state1 = await service.start(spec1)

      const spec2: RuntimeSpec = { id: 'test-svc', entry: echoServer, revision: 'b' }
      const state2 = await service.start(spec2)

      expect(state2.status).toBe('running')
      // Should have a new PID
      expect(state2.pid).not.toBe(state1.pid)
    })

    it('should return crashed state if process exits immediately', async () => {
      const spec: RuntimeSpec = { id: 'crash-svc', entry: crashHelper }
      const state = await service.start(spec)

      expect(state.status).toBe('crashed')
    })
  })

  describe('stop', () => {
    it('should stop a running runtime', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await service.start(spec)
      const state = await service.stop('test-svc')

      expect(state.status).toBe('stopped')
    })

    it('should be safe to stop non-existent runtime', async () => {
      await expect(service.stop('non-existent')).resolves.not.toThrow()
    })
  })

  describe('inspect', () => {
    it('should return null for unknown runtime', async () => {
      const state = await service.inspect('non-existent')
      expect(state).toBeNull()
    })

    it('should return current state after start', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await service.start(spec)

      const state = await service.inspect('test-svc')
      expect(state!.status).toBe('running')
    })

    it('should return state from registry after restart', async () => {
      const spec: RuntimeSpec = { id: 'persist-svc', entry: echoServer }
      await service.start(spec)

      // Create a fresh service to test registry persistence
      const backend2 = new NodeProcessBackend()
      const service2 = new RuntimeService(backend2, registry)

      const state = await service2.inspect('persist-svc')
      expect(state).not.toBeNull()
      expect(state!.status).toBe('running')
    })
  })

  describe('logs', () => {
    it('should capture stdout from runtime', async () => {
      const spec: RuntimeSpec = { id: 'test-svc', entry: echoServer }
      await service.start(spec)

      const logs: string[] = []
      for await (const event of service.logs('test-svc')) {
        if (event.type === 'runtime.log') {
          const payload = event.payload as { stream: string; line: string }
          logs.push(payload.line)
          if (logs.length >= 3) break
        }
      }

      expect(logs.some((l) => l.startsWith('alive'))).toBe(true)
    })
  })

  describe('listRunning', () => {
    it('should return empty initially', () => {
      expect(service.listRunning()).toEqual([])
    })

    it('should list running runtimes', async () => {
      await service.start({ id: 'test-svc', entry: echoServer })
      const running = service.listRunning()
      expect(running).toContain('test-svc')
    })
  })
})
