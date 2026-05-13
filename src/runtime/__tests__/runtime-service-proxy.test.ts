import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../daemon/registry'
import { SocketServer } from '../../ipc/socket-server'
import { SocketClient } from '../../ipc/socket-client'
import { RuntimeService } from '../runtime-service'
import { NodeProcessBackend } from '../../backend/node-process-backend'
import { RuntimeServiceProxy, specsMatch } from '../runtime-service-proxy'
import { IpcMethod } from '../../ipc/protocol'

const echoServer = join(import.meta.dirname, '..', '..', 'backend', '__tests__', 'helpers', 'echo-server.cjs')

describe('specsMatch', () => {
  const base = { id: 'svc', entry: '/a.js' }

  it('should match identical specs', () => {
    expect(specsMatch(base, { id: 'svc', entry: '/a.js' })).toBe(true)
  })

  it('should not match different entry', () => {
    expect(specsMatch(base, { id: 'svc', entry: '/b.js' })).toBe(false)
  })

  it('should match same args', () => {
    expect(
      specsMatch(
        { ...base, args: ['--port', '8080'] },
        { ...base, args: ['--port', '8080'] },
      ),
    ).toBe(true)
  })

  it('should not match different args', () => {
    expect(
      specsMatch(
        { ...base, args: ['--port', '8080'] },
        { ...base, args: ['--port', '9090'] },
      ),
    ).toBe(false)
  })

  it('should match same env', () => {
    expect(
      specsMatch(
        { ...base, env: { FOO: '1' } },
        { ...base, env: { FOO: '1' } },
      ),
    ).toBe(true)
  })

  it('should not match different env', () => {
    expect(
      specsMatch(
        { ...base, env: { FOO: '1' } },
        { ...base, env: { FOO: '2' } },
      ),
    ).toBe(false)
  })

  it('should handle undefined args and env as empty', () => {
    expect(specsMatch(base, { ...base, args: [] })).toBe(true)
    expect(specsMatch(base, { ...base, env: {} })).toBe(true)
  })
})

describe('RuntimeServiceProxy', () => {
  let registry: Registry
  let server: SocketServer
  let client: SocketClient
  let baseDir: string

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-proxy-test-'))
    registry = new Registry(baseDir)
    await registry.init()

    const backend = new NodeProcessBackend()
    const runtimeService = new RuntimeService(backend, registry)

    server = new SocketServer(registry)
    server.on(IpcMethod.RuntimeStart, async (req) =>
      runtimeService.start(req.params as any),
    )
    server.on(IpcMethod.RuntimeStop, async (req) => {
      const params = req.params as { id: string }
      return runtimeService.stop(params.id)
    })
    server.on(IpcMethod.RuntimeInspect, async (req) => {
      const params = req.params as { id: string }
      return runtimeService.inspect(params.id)
    })
    server.on(IpcMethod.RuntimeGetSpec, async (req) => {
      const params = req.params as { id: string }
      return runtimeService.getSpec(params.id) ?? null
    })
    server.start()
    await server.listen()

    client = new SocketClient(registry.getSocketPath())
    await client.connect()
  })

  afterEach(async () => {
    await client.close()
    await server.close()
    await rm(baseDir, { recursive: true, force: true })
  })

  it('should start a runtime via proxy', async () => {
    const proxy = new RuntimeServiceProxy(client, 'test-svc')
    const state = await proxy.up({ id: 'test-svc', entry: echoServer })

    expect(state.status).toBe('running')
    expect(state.pid).toBeGreaterThan(0)
    expect(proxy.state?.status).toBe('running')
    expect(proxy.pid).toBe(state.pid)
  })

  it('should stop a runtime via proxy', async () => {
    const proxy = new RuntimeServiceProxy(client, 'test-svc')
    await proxy.up({ id: 'test-svc', entry: echoServer })
    const state = await proxy.down()

    expect(state.status).toBe('stopped')
    expect(proxy.state?.status).toBe('stopped')
  })

  it('should refresh state', async () => {
    const proxy = new RuntimeServiceProxy(client, 'test-svc')
    await proxy.up({ id: 'test-svc', entry: echoServer })

    // Manually stop via direct IPC
    await client.request('runtime.stop', { id: 'test-svc' })

    // Proxy still has old cached state
    expect(proxy.state?.status).toBe('running')

    // Refresh
    const state = await proxy.refresh()
    expect(state?.status).toBe('stopped')
    expect(proxy.state?.status).toBe('stopped')
  })

  it('should get null for non-existent runtime', async () => {
    const proxy = new RuntimeServiceProxy(client, 'non-existent')
    const state = await proxy.refresh()
    expect(state).toBeNull()
    expect(proxy.state).toBeNull()
  })

  it('should handle markConflicted and attach', async () => {
    // First start a runtime
    const p1 = new RuntimeServiceProxy(client, 'svc')
    await p1.up({ id: 'svc', entry: echoServer })

    // Create a proxy with a different spec — mark as conflicted
    const p2 = new RuntimeServiceProxy(client, 'svc')
    p2.markConflicted(
      { id: 'svc', entry: echoServer },
      { id: 'svc', entry: '/different.js' },
    )

    expect(p2.conflicted).toBe(true)
    expect(p2.existingSpec?.entry).toBe(echoServer)
    expect(p2.requestedSpec?.entry).toBe('/different.js')

    // Attach to existing
    const state = await p2.attach()
    expect(state?.status).toBe('running')
    expect(p2.conflicted).toBe(false)
  })

  it('should handle replace', async () => {
    // First start a runtime
    const p1 = new RuntimeServiceProxy(client, 'svc')
    await p1.up({ id: 'svc', entry: echoServer })

    // Replace
    const p2 = new RuntimeServiceProxy(client, 'svc')
    p2.markConflicted(
      { id: 'svc', entry: echoServer },
      { id: 'svc', entry: echoServer },
    )
    const state = await p2.replace()
    expect(state.status).toBe('running')
    expect(p2.conflicted).toBe(false)
  })

  it('should handle ignore', () => {
    const proxy = new RuntimeServiceProxy(client, 'svc')
    proxy.markConflicted(
      { id: 'svc', entry: echoServer },
      { id: 'svc', entry: '/different.js' },
    )
    expect(proxy.conflicted).toBe(true)

    proxy.ignore()
    expect(proxy.conflicted).toBe(false)
  })
})
