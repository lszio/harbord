import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const ws = (p: string) => join(projectRoot, p)

async function waitForSocket(socketPath: string, timeout = 10000): Promise<void> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Socket not ready: ${socketPath}`)
}

describe('Harbor SDK (E2E)', () => {
  let baseDir: string | null = null

  afterEach(async () => {
    if (baseDir) {
      await rm(baseDir, { recursive: true, force: true })
      baseDir = null
    }
  })

  async function createHarbor(options: any = {}) {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-sdk-e2e-'))
    const { Harbor }: any = await import(ws('dist/esm/index.js'))
    return new Harbor({
      home: baseDir,
      timeout: 10000,
      ...options,
    })
  }

  describe('Automatic Daemon Control', () => {
    it('should automatically start daemon and handle service lifecycle', async () => {
      const h = await createHarbor()

      // 1. Check daemon status (triggers auto-bootstrap)
      const info = await h.daemon.status()
      expect(info.pid).toBeGreaterThan(0)
      expect(existsSync(join(baseDir!, 'runtime.sock'))).toBe(true)

      // 2. Start a service
      const svc = await h.service('e2e-svc', {
        id: 'e2e-svc',
        entry: ws('fixtures/echo-server.cjs'),
      })
      expect(svc.state.status).toBe('running')

      // 3. Inspect service
      const refreshed = await svc.refresh()
      expect(refreshed.status).toBe('running')

      // 4. Stop service
      await svc.down()
      expect(svc.state.status).toBe('stopped')

      // 5. Cleanup daemon
      await h.daemon.stop()
    }, 20000)

    it('should handle self-registration and heartbeats', async () => {
      const h = await createHarbor()

      const self = await h.self('worker-1')
      expect(self.id).toBe('worker-1')

      await self.expose({ port: 3000 })
      await self.alive()
      await self.shutdown()

      await h.daemon.stop()
    }, 20000)

    it('should handle service conflicts', async () => {
      const h = await createHarbor()

      // Start initial
      await h.service('conflict-test', {
        id: 'conflict-test',
        entry: ws('fixtures/echo-server.cjs'),
      })

      // Try starting with different spec
      const svc = await h.service('conflict-test', {
        id: 'conflict-test',
        entry: ws('fixtures/echo-server.cjs'),
        args: ['--debug'],
      })

      expect(svc.conflicted).toBe(true)
      expect(svc.requestedSpec.args).toContain('--debug')

      // Resolve conflict
      await svc.replace()
      expect(svc.conflicted).toBe(false)
      expect(svc.state.status).toBe('running')

      await h.daemon.stop()
    }, 20000)
  })

  describe('Manual Daemon Control', () => {
    it('should fail to connect if autoBootstrap is false and no daemon is running', async () => {
      const h = await createHarbor({ autoBootstrap: false })
      await expect(h.connect()).rejects.toThrow(/autoBootstrap is disabled/)
    })

    it('should connect to an already running daemon with autoBootstrap: false', async () => {
      const h = await createHarbor({ autoBootstrap: false })
      const cliPath = ws('dist/cjs/cli.cjs')

      // Start daemon manually
      const proc = spawn('node', [cliPath, '--daemon'], {
        env: { ...process.env, HARBORD_HOME: baseDir! },
        detached: true,
        stdio: 'ignore'
      })
      proc.unref()

      const socketPath = join(baseDir!, 'runtime.sock')
      await waitForSocket(socketPath)

      // Should connect successfully
      await h.connect()
      expect(h.connected).toBe(true)

      const info = await h.daemon.status()
      expect(info.pid).toBeGreaterThan(0)

      await h.daemon.stop()
    }, 20000)
  })
})
