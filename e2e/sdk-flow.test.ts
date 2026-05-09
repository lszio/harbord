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

interface DaemonCtx {
  proc: ChildProcess
  baseDir: string
  socketPath: string
  cleanup: () => Promise<void>
}

let daemonIdx = 0

async function startDaemon(): Promise<DaemonCtx> {
  const baseDir = mkdtempSync(join(tmpdir(), `harbord-e2e-sdk-${daemonIdx++}-`))
  const cliPath = ws('dist/cjs/cli.cjs')

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

describe('Harbor SDK (E2E)', () => {
  let daemon: DaemonCtx

  beforeEach(async () => {
    daemon = await startDaemon()
  })

  afterEach(async () => {
    await daemon.cleanup()
  })

  async function harbor() {
    const { Harbor }: any = await import(ws('dist/esm/index.js'))
    const h = new Harbor()
    const { Registry }: any = await import(ws('dist/esm/index.js'))
    const reg = new Registry(daemon.baseDir)
    await reg.init()
    await h.connect(reg)
    return h
  }

  it('should connect, start a service, inspect it, and stop', async () => {
    const h = await harbor()

    const svc = await h.service('e2e-svc', {
      id: 'e2e-svc',
      entry: ws('fixtures/echo-server.cjs'),
    })

    expect(svc.conflicted).toBe(false)
    expect(svc.state.status).toBe('running')
    expect(svc.pid).toBeGreaterThan(0)

    // Refresh from daemon
    const refreshed = await svc.refresh()
    expect(refreshed.status).toBe('running')

    // Stop
    const stopped = await svc.down()
    expect(stopped.status).toBe('stopped')

    await h.disconnect()
  })

  it('should detect spec conflicts via Harbor.service()', async () => {
    const h = await harbor()

    // Start with initial spec
    const svc1 = await h.service('conflict-svc', {
      id: 'conflict-svc',
      entry: ws('fixtures/echo-server.cjs'),
    })
    expect(svc1.conflicted).toBe(false)

    // Request same id with different entry — should be conflicted
    const svc2 = await h.service('conflict-svc', {
      id: 'conflict-svc',
      entry: ws('fixtures/echo-server.cjs'),
      args: ['--different'],
    })
    expect(svc2.conflicted).toBe(true)
    expect(svc2.existingSpec.entry).toBe(ws('fixtures/echo-server.cjs'))
    expect(svc2.requestedSpec.args).toEqual(['--different'])

    // Replace with the requested spec
    const state = await svc2.replace()
    expect(state.status).toBe('running')
    expect(svc2.conflicted).toBe(false)

    await h.disconnect()
  })

  it('should self-register, expose metadata, and send heartbeats', async () => {
    const h = await harbor()

    const self = await h.self('e2e-worker')
    expect(self.id).toBe('e2e-worker')

    await self.expose({ port: 8080 })
    await self.alive()
    await self.shutdown()

    await h.disconnect()
  })

  it('should get null inspecting a non-existent service', async () => {
    const h = await harbor()

    const svc = await h.service('non-existent')
    expect(svc.state).toBeNull()

    await h.disconnect()
  })

  it('should handle multiple concurrent services', async () => {
    const h = await harbor()

    const [svcA, svcB] = await Promise.all([
      h.service('multi-a', { id: 'multi-a', entry: ws('fixtures/echo-server.cjs') }),
      h.service('multi-b', { id: 'multi-b', entry: ws('fixtures/echo-server.cjs') }),
    ])

    expect(svcA.state.status).toBe('running')
    expect(svcB.state.status).toBe('running')
    expect(svcA.pid).not.toBe(svcB.pid)

    await svcA.down()
    await svcB.down()
    await h.disconnect()
  })
})
