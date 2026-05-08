import { connect, type Socket } from 'node:net'
import type { IpcRequest, IpcResponse, IpcEvent } from './protocol'
import { encodeMessage, decodeMessage } from './protocol'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class SocketClient {
  private socket: Socket | null = null
  private buffer = ''
  private pending = new Map<string, PendingRequest>()
  private eventListeners = new Map<string, Set<(data: unknown) => void>>()
  private connected = false
  private idCounter = 0

  constructor(private socketPath: string) {}

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect(this.socketPath, () => {
        this.connected = true
        resolve()
      })

      socket.on('data', (chunk: Buffer) => this.handleData(chunk))
      socket.on('close', () => {
        this.connected = false
        this.failPending(new Error('Connection closed'))
      })
      socket.on('error', (err) => {
        this.connected = false
        reject(err)
      })

      this.socket = socket
    })
  }

  async close(): Promise<void> {
    this.failPending(new Error('Client closed'))
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
  }

  async request<T = unknown>(method: string, params?: unknown, timeout = 5000): Promise<T> {
    const id = String(++this.idCounter)
    const req: IpcRequest = { id, method, params }
    const encoded = encodeMessage(req)

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, timeout)

      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer })

      if (this.socket) {
        this.socket.write(encoded)
      } else {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(new Error('Not connected'))
      }
    }) as Promise<T>
  }

  onEvent(event: string, listener: (data: unknown) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(listener)

    return () => {
      this.eventListeners.get(event)?.delete(listener)
    }
  }

  private handleData(chunk: Buffer): void {
    this.buffer += chunk.toString()
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      this.handleLine(trimmed)
    }
  }

  private handleLine(line: string): void {
    let msg: unknown
    try {
      msg = decodeMessage(line)
    } catch {
      return
    }

    const event = msg as IpcEvent
    if (event.event !== undefined) {
      this.dispatchEvent(event.event, event.data)
      return
    }

    const response = msg as IpcResponse
    if (response.id !== undefined) {
      const pending = this.pending.get(response.id)
      if (pending) {
        this.pending.delete(response.id)
        clearTimeout(pending.timer)

        if (response.error) {
          pending.reject(new Error(`${response.error.code}: ${response.error.message}`))
        } else {
          pending.resolve(response.result)
        }
      }
    }
  }

  private dispatchEvent(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        listener(data)
      }
    }
  }

  private failPending(reason: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(reason)
    }
    this.pending.clear()
  }
}
