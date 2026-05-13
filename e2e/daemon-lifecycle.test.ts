import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const ws = (p: string) => join(projectRoot, p)

async function waitForSocket(socketPath: string, timeout = 10000, interval = 100): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`Socket not ready after ${timeout}ms: ${socketPath}`)
}

async function waitForProcessExit(proc: ChildProcess, timeout = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Process did not exit')), timeout)
    proc.on('exit', () => { clearTimeout(timer); resolve() })
  })
}

let daemonIdx = 0

async function startDaemon(): Promise<{
  proc: ChildProcess
  baseDir: string
  socketPath: string
  cleanup: () => Promise<void>
}> {
  const baseDir = mkdtempSync(join(tmpdir(), `harbord-e2e-${daemonIdx++}-`))
  const cliPath = ws('dist/cjs/cli.cjs')

  if (!existsSync(cliPath)) {
    throw new Error(`CLI not found at ${cliPath}. Did you run build?`)
  }

  const proc = spawn('node', [cliPath, '--daemon'], {
    env: { ...process.env, HARBORD_HOME: baseDir },
    stdio: 'pipe',
    detached: true,
  })

  proc.stderr!.on('data', (chunk: Buffer) => {
    process.stderr.write(`[daemon:e2e] ${chunk.toString()}`)
  })

  const socket = join(baseDir, 'runtime.sock')
  await waitForSocket(socket)

  const cleanup = async () => {
    if (proc.pid && !proc.killed) {
      const group = -proc.pid
      try {
        process.kill(group, 'SIGTERM')
        await waitForProcessExit(proc).catch(() => {})
      } catch {
        proc.kill('SIGTERM')
        await waitForProcessExit(proc).catch(() => proc.kill('SIGKILL'))
      }
    }
    await rm(baseDir, { recursive: true, force: true })
  }

  return { proc, baseDir, socketPath: socket, cleanup }
}

describe('Daemon Lifecycle (E2E)', () => {
  let daemon: Awaited<ReturnType<typeof startDaemon>>

  beforeEach(async () => {
    daemon = await startDaemon()
  })

  afterEach(async () => {
    if (daemon) {
      await daemon.cleanup()
    }
  })

  // Shortcut: create a connected client
  async function client() {
    const { SocketClient }: any = await import(ws('dist/esm/index.js'))
    const c = new SocketClient(daemon.socketPath)
    await c.connect()
    return c
  }

  // ── Registry IPC ──────────────────────────────────────────────

  it('should start and accept IPC connections', async () => {
    const c = await client()
    const ids: string[] = await c.request('registry.list')
    expect(ids).toEqual([])
    await c.close()
  })

  it('should persist and retrieve runtime states', async () => {
    const c = await client()

    const { Registry }: any = await import(ws('dist/esm/index.js'))
    const reg = new Registry(daemon.baseDir)
    await reg.saveState('svc-a', { status: 'running', pid: 1001, startedAt: Date.now() })
    await reg.saveState('svc-b', { status: 'stopped', startedAt: Date.now() - 5000 })

    const ids: string[] = await c.request('registry.list')
    expect(ids.sort()).toEqual(['svc-a', 'svc-b'])

    const stateA: { status: string; pid?: number } = await c.request('registry.get', { id: 'svc-a' })
    expect(stateA.status).toBe('running')
    expect(stateA.pid).toBe(1001)

    await c.close()
  })

  // ── Runtime Lifecycle ─────────────────────────────────────────

  it('should start and stop a runtime', async () => {
    const c = await client()

    const state: { status: string; pid: number } = await c.request('runtime.start', {
      id: 'e2e-svc',
      entry: ws('e2e/fixtures/echo-server.cjs'),
    })
    expect(state.status).toBe('running')
    expect(state.pid).toBeGreaterThan(0)

    const stopped: { status: string } = await c.request('runtime.stop', { id: 'e2e-svc' })
    expect(stopped.status).toBe('stopped')

    await c.close()
  })

  it('should inspect a running runtime', async () => {
    const c = await client()

    await c.request('runtime.start', { id: 'e2e-svc', entry: ws('e2e/fixtures/echo-server.cjs') })

    const state: { status: string; pid: number } = await c.request('runtime.inspect', { id: 'e2e-svc' })
    expect(state.status).toBe('running')
    expect(state.pid).toBeGreaterThan(0)

    await c.request('runtime.stop', { id: 'e2e-svc' })
    await c.close()
  })

  it('should return crashed state for runtime without entry', async () => {
    const c = await client()

    const state: { status: string } = await c.request('runtime.start', { id: 'bad-svc' })
    expect(state.status).toBe('crashed')

    await c.close()
  })

  // ── Self API ──────────────────────────────────────────────────

  it('should register self and expose metadata', async () => {
    const c = await client()

    const reg: { registered: boolean } = await c.request('self.register', { id: 'my-worker' })
    expect(reg.registered).toBe(true)

    const exp: { exposed: boolean } = await c.request('self.expose', {
      id: 'my-worker',
      metadata: { port: 8080 },
    })
    expect(exp.exposed).toBe(true)

    await c.close()
  })

  // ── Concurrent ────────────────────────────────────────────────

  it('should handle multiple concurrent clients', async () => {
    const { SocketClient }: any = await import(ws('dist/esm/index.js'))
    const c1 = new SocketClient(daemon.socketPath)
    const c2 = new SocketClient(daemon.socketPath)
    await c1.connect()
    await c2.connect()

    await c1.request('runtime.start', { id: 'shared-svc', entry: ws('e2e/fixtures/echo-server.cjs') })

    const [ids1, ids2]: [string[], string[]] = await Promise.all([
      c1.request('registry.list'),
      c2.request('registry.list'),
    ])
    expect(ids1).toContain('shared-svc')
    expect(ids2).toContain('shared-svc')

    await c1.request('runtime.stop', { id: 'shared-svc' })
    await c1.close()
    await c2.close()
  })

  // ── Fixture: process lifecycle ────────────────────────────────

  it('should detect a crashed process', async () => {
    const c = await client()

    const state: { status: string } = await c.request('runtime.start', {
      id: 'crash-svc',
      entry: ws('e2e/fixtures/crash-immediately.cjs'),
    })
    expect(state.status).toBe('crashed')

    await c.close()
  })
})
