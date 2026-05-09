import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../daemon/registry'
import { SocketServer } from '../../ipc/socket-server'
import { SocketClient } from '../../ipc/socket-client'
import { DaemonControl } from '../daemon-control'
import { IpcMethod } from '../../ipc/protocol'

describe('DaemonControl', () => {
  let registry: Registry
  let server: SocketServer
  let client: SocketClient
  let baseDir: string
  let control: DaemonControl

  const startedAt = Date.now()

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-daemon-ctrl-test-'))
    registry = new Registry(baseDir)
    await registry.init()

    server = new SocketServer(registry)
    server.on(IpcMethod.DaemonStatus, async () => ({
      pid: process.pid,
      uptime: Date.now() - startedAt,
      startedAt,
      reconcilerRunning: true,
      runtimes: 2,
      registered: ['svc-a', 'svc-b'],
    }))
    server.on(IpcMethod.DaemonShutdown, async () => ({
      shuttingDown: true,
      pid: process.pid,
      uptime: Date.now() - startedAt,
      runtimes: 2,
    }))
    server.start()
    await server.listen()

    client = new SocketClient(registry.getSocketPath())
    await client.connect()
    control = new DaemonControl(client)
  })

  afterEach(async () => {
    await client.close()
    await server.close()
    await rm(baseDir, { recursive: true, force: true })
  })

  it('should return daemon status', async () => {
    const info = await control.status()
    expect(info.pid).toBe(process.pid)
    expect(info.uptime).toBeGreaterThan(0)
    expect(info.reconcilerRunning).toBe(true)
    expect(info.runtimes).toBe(2)
    expect(info.registered).toEqual(['svc-a', 'svc-b'])
  })

  it('should shutdown daemon', async () => {
    const result = await control.stop()
    expect(result.shuttingDown).toBe(true)
  })

  it('should be accessible via Harbor.daemon after connect', async () => {
    const { Harbor }: any = await import('../harbor')
    const h = new Harbor()
    const reg = new Registry(baseDir)
    await reg.init()
    await h.connect(reg)
    expect(h.daemon).toBeDefined()
    expect(typeof h.daemon.status).toBe('function')
    expect(typeof h.daemon.stop).toBe('function')
    await h.disconnect()
  })
})
