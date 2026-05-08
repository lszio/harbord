import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn, type ChildProcess } from 'node:child_process'

// Import from the SDK entry, not internal modules
import { SocketClient, Registry } from '../src/index'

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'harbord-e2e-'))
}

async function waitForSocket(
  socketPath: string,
  timeout = 10000,
  interval = 100,
): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return
    await new Promise((r) => setTimeout(r, interval))
  }
  throw new Error(`Socket not ready after ${timeout}ms: ${socketPath}`)
}

async function waitForProcessExit(proc: ChildProcess, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Process did not exit')), timeout)
    proc.on('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function startDaemon(): Promise<{
  proc: ChildProcess
  baseDir: string
  registry: Registry
  cleanup: () => Promise<void>
}> {
  const baseDir = createTempDir()
  const cliPath = join(import.meta.dirname, '..', 'src', 'cli.ts')

  const proc = spawn('bun', [cliPath, '--daemon'], {
    env: { ...process.env, HARBORD_HOME: baseDir },
    stdio: 'pipe',
    detached: true,
  })

  proc.stderr!.on('data', (chunk: Buffer) => {
    process.stderr.write(`[daemon:e2e] ${chunk.toString()}`)
  })

  const registry = new Registry(baseDir)
  await waitForSocket(registry.getSocketPath())

  const cleanup = async () => {
    if (proc.pid && !proc.killed) {
      const group = -proc.pid
      try {
        process.kill(group, 'SIGTERM')
        await waitForProcessExit(proc, 3000).catch(() => {})
      } catch {
        proc.kill('SIGTERM')
        await waitForProcessExit(proc, 2000).catch(() => {
          proc.kill('SIGKILL')
        })
      }
    }
    await rm(baseDir, { recursive: true, force: true })
  }

  return { proc, baseDir, registry, cleanup }
}

describe('Daemon Lifecycle (E2E)', () => {
  let daemon: {
    proc: ChildProcess
    baseDir: string
    registry: Registry
    cleanup: () => Promise<void>
  }

  beforeEach(async () => {
    daemon = await startDaemon()
  })

  afterEach(async () => {
    await daemon.cleanup()
  })

  it('should start and accept IPC connections', async () => {
    const client = new SocketClient(daemon.registry.getSocketPath())
    await client.connect()

    const ids = await client.request<string[]>('registry.list')
    expect(ids).toEqual([])

    await client.close()
  })

  it('should persist and retrieve runtime states', async () => {
    const client = new SocketClient(daemon.registry.getSocketPath())
    await client.connect()

    await daemon.registry.saveState('svc-a', {
      status: 'running',
      pid: 1001,
      startedAt: Date.now(),
    })
    await daemon.registry.saveState('svc-b', {
      status: 'stopped',
      startedAt: Date.now() - 5000,
    })

    const ids = await client.request<string[]>('registry.list')
    expect(ids.sort()).toEqual(['svc-a', 'svc-b'])

    const stateA = await client.request<{ status: string; pid?: number }>(
      'registry.get',
      { id: 'svc-a' },
    )
    expect(stateA.status).toBe('running')
    expect(stateA.pid).toBe(1001)

    await client.close()
  })

  it('should handle multiple concurrent clients', async () => {
    const client1 = new SocketClient(daemon.registry.getSocketPath())
    const client2 = new SocketClient(daemon.registry.getSocketPath())
    await client1.connect()
    await client2.connect()

    await daemon.registry.saveState('shared', { status: 'running' })

    const ids1 = await client1.request<string[]>('registry.list')
    const ids2 = await client2.request<string[]>('registry.list')
    expect(ids1).toEqual(['shared'])
    expect(ids2).toEqual(['shared'])

    await client1.close()
    await client2.close()
  })

  it('should handle concurrent IPC requests', async () => {
    const client = new SocketClient(daemon.registry.getSocketPath())
    await client.connect()

    await Promise.all([
      daemon.registry.saveState('c1', { status: 'running', pid: 1 }),
      daemon.registry.saveState('c2', { status: 'running', pid: 2 }),
      daemon.registry.saveState('c3', { status: 'running', pid: 3 }),
    ])

    const results = await Promise.all([
      client.request('registry.get', { id: 'c1' }),
      client.request('registry.get', { id: 'c2' }),
      client.request('registry.get', { id: 'c3' }),
    ])

    expect(results.map((r: any) => r.pid)).toEqual([1, 2, 3])

    await client.close()
  })

  it('should return null for non-existent runtime', async () => {
    const client = new SocketClient(daemon.registry.getSocketPath())
    await client.connect()

    const state = await client.request('registry.get', { id: 'non-existent' })
    expect(state).toBeNull()

    await client.close()
  })

  it('should survive a remove then list cycle', async () => {
    const client = new SocketClient(daemon.registry.getSocketPath())
    await client.connect()

    await daemon.registry.saveState('tmp', { status: 'running' })
    await daemon.registry.saveState('keep', { status: 'running' })
    await daemon.registry.removeState('tmp')

    const ids = await client.request<string[]>('registry.list')
    expect(ids).toEqual(['keep'])

    await client.close()
  })
})
