import { createServer, type Socket } from 'node:net'
import { unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { Registry } from '../daemon/registry'
import type { IpcRequest, IpcResponse } from './protocol'
import { encodeMessage, decodeMessage, createResponse, createError } from './protocol'

type IpcHandler = (req: IpcRequest) => Promise<unknown> | AsyncIterable<unknown>

export class SocketServer {
  private server = createServer()
  private handlers = new Map<string, IpcHandler>()
  private connections = new Set<Socket>()

  constructor(private registry: Registry) {}

  on(method: string, handler: IpcHandler): void {
    this.handlers.set(method, handler)
  }

  async listen(): Promise<void> {
    const socketPath = this.registry.getSocketPath()

    if (existsSync(socketPath)) {
      await unlink(socketPath)
    }

    return new Promise((resolve) => {
      this.server.listen(socketPath, () => {
        resolve()
      })
    })
  }

  async close(): Promise<void> {
    for (const conn of this.connections) {
      conn.destroy()
    }
    this.connections.clear()
    return new Promise((resolve) => {
      this.server.close(() => resolve())
    })
  }

  start(): void {
    this.server.on('connection', (socket) => this.handleConnection(socket))
    this.server.on('error', () => {})
  }

  private handleConnection(socket: Socket): void {
    this.connections.add(socket)

    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.length === 0) continue
        this.handleMessage(socket, trimmed)
      }
    })

    socket.on('close', () => {
      this.connections.delete(socket)
    })

    socket.on('error', () => {
      this.connections.delete(socket)
    })
  }

  private async handleMessage(socket: Socket, line: string): Promise<void> {
    let req: IpcRequest
    try {
      const parsed = decodeMessage(line)
      req = parsed as IpcRequest

      if (!req.id || !req.method) {
        const err = createError(
          { id: req.id ?? '', method: req.method ?? '' },
          'INVALID_REQUEST',
          'Request must have id and method',
        )
        socket.write(encodeMessage(err))
        return
      }
    } catch {
      const errResp: IpcResponse = {
        id: '',
        error: { code: 'PARSE_ERROR', message: 'Invalid JSON' },
      }
      socket.write(encodeMessage(errResp))
      return
    }

    const handler = this.handlers.get(req.method)
    if (!handler) {
      const err = createError(req, 'METHOD_NOT_FOUND', `Unknown method: ${req.method}`)
      socket.write(encodeMessage(err))
      return
    }

    try {
      const result = await handler(req)
      const response = createResponse(req, result)
      socket.write(encodeMessage(response))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const err = createError(req, 'HANDLER_ERROR', message)
      socket.write(encodeMessage(err))
    }
  }
}
