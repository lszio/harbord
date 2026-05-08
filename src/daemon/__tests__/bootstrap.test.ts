import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../registry'
import { SocketServer } from '../../ipc/socket-server'
import { SocketClient } from '../../ipc/socket-client'

describe('Bootstrap', () => {
  let registry: Registry
  let baseDir: string

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-bootstrap-test-'))
    registry = new Registry(baseDir)
    await registry.init()
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  describe('bootstrap lock', () => {
    it('should allow first acquirer to become leader', async () => {
      const acquired = await registry.acquireBootstrapLock()
      expect(acquired).toBe(true)
    })

    it('should give second acquirer follower status', async () => {
      const a1 = await registry.acquireBootstrapLock()
      const a2 = await registry.acquireBootstrapLock()
      expect(a1).toBe(true)
      expect(a2).toBe(false)
    })
  })

  describe('direct connection (daemon already running)', () => {
    it('should connect to an existing daemon socket', async () => {
      const server = new SocketServer(registry)
      server.start()
      await server.listen()
      server.on('ping', async () => 'pong')

      const client = new SocketClient(registry.getSocketPath())
      await client.connect()

      const result = await client.request('ping')
      expect(result).toBe('pong')

      await client.close()
      await server.close()
    })
  })
})
