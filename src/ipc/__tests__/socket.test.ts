import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../../daemon/registry'
import { SocketServer } from '../socket-server'
import { SocketClient } from '../socket-client'

describe('Socket Server + Client', () => {
  let registry: Registry
  let server: SocketServer
  let baseDir: string

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'harbord-socket-test-'))
    registry = new Registry(baseDir)
    await registry.init()

    server = new SocketServer(registry)
    server.start()
    await server.listen()
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  it('should handle request/response roundtrip', async () => {
    server.on('echo', async (req) => req.params)

    const client = new SocketClient(registry.getSocketPath())
    await client.connect()

    const result = await client.request('echo', { message: 'hello' })
    expect(result).toEqual({ message: 'hello' })

    await client.close()
  })

  it('should handle unknown method error', async () => {
    const client = new SocketClient(registry.getSocketPath())
    await client.connect()

    await expect(client.request('unknown.method')).rejects.toThrow(
      'METHOD_NOT_FOUND: Unknown method: unknown.method',
    )

    await client.close()
  })

  it('should handle handler that throws', async () => {
    server.on('failing', async () => {
      throw new Error('Something went wrong')
    })

    const client = new SocketClient(registry.getSocketPath())
    await client.connect()

    await expect(client.request('failing')).rejects.toThrow(
      'HANDLER_ERROR: Something went wrong',
    )

    await client.close()
  })

  it('should handle timeout', async () => {
    server.on('slow', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000))
      return 'done'
    })

    const client = new SocketClient(registry.getSocketPath())
    await client.connect()

    await expect(client.request('slow', undefined, 200)).rejects.toThrow(
      'Request timeout: slow',
    )

    await client.close()
  })

  it('should handle multiple concurrent requests', async () => {
    server.on('ping', async (req) => {
      const params = req.params as { n: number }
      return { pong: params.n }
    })

    const client = new SocketClient(registry.getSocketPath())
    await client.connect()

    const results = await Promise.all([
      client.request('ping', { n: 1 }),
      client.request('ping', { n: 2 }),
      client.request('ping', { n: 3 }),
    ])

    expect(results).toEqual([{ pong: 1 }, { pong: 2 }, { pong: 3 }])
    await client.close()
  })

  it('should reject request when not connected', async () => {
    const client = new SocketClient(registry.getSocketPath())
    await expect(client.request('any')).rejects.toThrow('Not connected')
  })
})
