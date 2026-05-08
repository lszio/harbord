import { spawn } from 'node:child_process'
import type { RuntimeSpec } from '../core/runtime-spec'
import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeEvent } from '../core/runtime-event'
import type { RuntimeBackend } from './runtime-backend'

type LogListener = (event: RuntimeEvent) => void

interface ManagedProcess {
  child: import('node:child_process').ChildProcess
  spec: RuntimeSpec
  startedAt: number
  logBuffer: RuntimeEvent[]
}

const MAX_LOG_BUFFER = 512

export class NodeProcessBackend implements RuntimeBackend {
  private processes = new Map<string, ManagedProcess>()
  private logListeners = new Map<string, Set<LogListener>>()

  async ensure(spec: RuntimeSpec): Promise<void> {
    if (this.processes.has(spec.id)) {
      const existing = this.processes.get(spec.id)!
      if (!existing.child.killed) {
        return
      }
    }

    if (!spec.entry) {
      throw new Error(`Runtime ${spec.id} has no entry point`)
    }

    const child = spawn(process.execPath, [spec.entry, ...(spec.args ?? [])], {
      env: { ...process.env, ...spec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const managed: ManagedProcess = {
      child,
      spec,
      startedAt: Date.now(),
      logBuffer: [],
    }

    this.processes.set(spec.id, managed)

    // Wait briefly for the process to either start or crash
    await new Promise<void>((resolve) => {
      const check = () => {
        const p = this.processes.get(spec.id)
        if (!p) {
          resolve()
          return
        }
        if (p.child.pid && !p.child.killed) {
          resolve()
          return
        }
        setImmediate(check)
      }
      setTimeout(check, 200)
    })

    if (!this.processes.has(spec.id)) {
      return
    }

    child.stdout!.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        const event: RuntimeEvent = {
          type: 'runtime.log',
          source: spec.id,
          timestamp: Date.now(),
          payload: { stream: 'stdout', line },
        }
        this.broadcastLog(spec.id, event)
      }
    })

    child.stderr!.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean)
      for (const line of lines) {
        const event: RuntimeEvent = {
          type: 'runtime.log',
          source: spec.id,
          timestamp: Date.now(),
          payload: { stream: 'stderr', line },
        }
        this.broadcastLog(spec.id, event)
      }
    })

    child.on('exit', (code, signal) => {
      const event: RuntimeEvent = {
        type: 'runtime.process.exited',
        source: spec.id,
        timestamp: Date.now(),
        payload: { code, signal },
      }
      this.broadcastLog(spec.id, event)
      this.processes.delete(spec.id)
    })

    child.on('error', () => {
      this.processes.delete(spec.id)
    })
  }

  async stop(id: string): Promise<void> {
    const managed = this.processes.get(id)
    if (!managed) return

    const { child } = managed

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL')
      }, 5000)

      child.on('exit', () => {
        clearTimeout(timeout)
        resolve()
      })

      child.kill('SIGTERM')
    })
  }

  async remove(id: string): Promise<void> {
    await this.stop(id)
    this.processes.delete(id)
  }

  async inspect(id: string): Promise<RuntimeState> {
    const managed = this.processes.get(id)
    if (!managed) {
      return { status: 'idle' }
    }

    const { child, startedAt } = managed
    const pid = child.pid ?? undefined

    if (child.killed) {
      return { status: 'stopped', pid, startedAt }
    }

    const alive = this.isAlive(pid)
    if (!alive) {
      this.processes.delete(id)
      return { status: 'crashed', pid, startedAt }
    }

    return { status: 'running', pid, startedAt }
  }

  async *logs(id: string): AsyncIterable<RuntimeEvent> {
    const buffer: RuntimeEvent[] = []
    let closed = false
    let pendingResolve: (() => void) | null = null

    const remove = this.addLogListener(id, (event) => {
      buffer.push(event)
      if (pendingResolve) {
        pendingResolve()
        pendingResolve = null
      }
    })

    // Drain ring buffer first
    const managed = this.processes.get(id)
    if (managed && managed.logBuffer.length > 0) {
      for (const event of managed.logBuffer) {
        buffer.push(event)
      }
    }

    try {
      while (!closed) {
        const current = this.processes.get(id)
        if (!current || (current.child.killed && buffer.length === 0)) {
          closed = true
          return
        }

        if (buffer.length > 0) {
          yield buffer.shift()!
        } else {
          await new Promise<void>((resolve) => {
            pendingResolve = resolve
          })
        }
      }
    } finally {
      remove()
    }
  }

  private addLogListener(id: string, listener: LogListener): () => void {
    if (!this.logListeners.has(id)) {
      this.logListeners.set(id, new Set())
    }
    this.logListeners.get(id)!.add(listener)
    return () => {
      this.logListeners.get(id)?.delete(listener)
    }
  }

  private broadcastLog(id: string, event: RuntimeEvent): void {
    // Always buffer so late subscribers get history
    const managed = this.processes.get(id)
    if (managed) {
      managed.logBuffer.push(event)
      if (managed.logBuffer.length > MAX_LOG_BUFFER) {
        managed.logBuffer.shift()
      }
    }

    this.logListeners.get(id)?.forEach((fn) => fn(event))
  }

  private isAlive(pid?: number): boolean {
    if (pid === undefined) return false
    try {
      return process.kill(pid, 0)
    } catch {
      return false
    }
  }
}
