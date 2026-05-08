import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../daemon/registry'
import { SocketServer } from '../../ipc/socket-server'
import { SocketClient } from '../../ipc/socket-client'
import { Self } from '../self'
import { IpcMethod } from '../../ipc/protocol'

describe('Self', () => {
  let registry: Registry
  let server: SocketServer
  let client: SocketClient
  let baseDir: string

  const selfMetadata = new Map<string, Record<string, unknown>>()

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-self-test-'))
    registry = new Registry(baseDir)
    await registry.init()

    server = new SocketServer(registry)
    server.on(IpcMethod.SelfRegister, async (req) => {
      const params = req.params as { id: string }
      selfMetadata.set(params.id, {})
      return { registered: true }
    })
    server.on(IpcMethod.SelfExpose, async (req) => {
      const params = req.params as { id: string; metadata: Record<string, unknown> }
      selfMetadata.set(params.id, params.metadata)
      return { exposed: true }
    })
    server.on(IpcMethod.SelfAlive, async (req) => {
      const params = req.params as { id: string; timestamp: number }
      return { ok: true, timestamp: params.timestamp }
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

  it('should expose metadata', async () => {
    const self = new Self(client, 'test-worker')
    await self.expose({ port: 8080, protocol: 'http' })

    expect(selfMetadata.get('test-worker')).toEqual({ port: 8080, protocol: 'http' })
  })

  it('should send alive signal', async () => {
    const self = new Self(client, 'test-worker')
    await expect(self.alive()).resolves.not.toThrow()
  })

  it('should have the correct id', () => {
    const self = new Self(client, 'worker-1')
    expect(self.id).toBe('worker-1')
  })

  it('should be safe to call alive after shutdown', async () => {
    const self = new Self(client, 'test-worker')
    await self.shutdown()
    await expect(self.alive()).resolves.not.toThrow()
  })
})
