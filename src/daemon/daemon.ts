import { Registry } from './registry'
import { SocketServer } from '../ipc/socket-server'
import { IpcMethod } from '../ipc/protocol'
import { NodeProcessBackend } from '../backend/node-process-backend'
import { RuntimeService } from '../runtime/runtime-service'
import { Reconciler } from '../core/reconciler'
import { HeartbeatTracker } from '../core/heartbeat'

export class Daemon {
  private registry: Registry
  private server: SocketServer
  private runtimeService: RuntimeService
  private reconciler: Reconciler
  private heartbeats = new HeartbeatTracker()
  private _startedAt = 0

  constructor(baseDir?: string) {
    this.registry = new Registry(baseDir)
    this.server = new SocketServer(this.registry)
    this.runtimeService = new RuntimeService(new NodeProcessBackend(), this.registry)
    this.reconciler = new Reconciler(this.runtimeService, undefined, this.heartbeats)
  }

  get running(): boolean {
    return this._startedAt > 0
  }

  get startedAt(): number {
    return this._startedAt
  }

  get uptime(): number {
    return this._startedAt > 0 ? Date.now() - this._startedAt : 0
  }

  async start(): Promise<void> {
    await this.registry.init()
    this.setupHandlers()

    this.server.start()
    await this.server.listen()

    this._startedAt = Date.now()
    this.reconciler.start()
    this.setupSignalHandlers()
  }

  async shutdown(): Promise<void> {
    this.reconciler.stop()

    // Stop all running runtimes gracefully
    const running = this.runtimeService.listRunning()
    for (const id of running) {
      await this.runtimeService.stop(id).catch(() => {})
    }

    await this.server.close()
    this._startedAt = 0
  }

  private setupHandlers(): void {
    // Registry
    this.server.on(IpcMethod.RegistryList, async () => {
      return this.registry.listIds()
    })
    this.server.on(IpcMethod.RegistryGet, async (req) => {
      const params = req.params as { id: string }
      return this.registry.loadState(params.id)
    })

    // Runtime lifecycle
    this.server.on(IpcMethod.RuntimeStart, async (req) => {
      return this.runtimeService.start(req.params as Parameters<typeof this.runtimeService.start>[0])
    })
    this.server.on(IpcMethod.RuntimeStop, async (req) => {
      const params = req.params as { id: string }
      return this.runtimeService.stop(params.id)
    })
    this.server.on(IpcMethod.RuntimeInspect, async (req) => {
      const params = req.params as { id: string }
      return this.runtimeService.inspect(params.id)
    })
    this.server.on(IpcMethod.RuntimeGetSpec, async (req) => {
      const params = req.params as { id: string }
      return this.runtimeService.getSpec(params.id) ?? null
    })

    // Self registration
    const selfMetadata = new Map<string, Record<string, unknown>>()
    this.server.on(IpcMethod.SelfRegister, async (req) => {
      const params = req.params as { id: string }
      selfMetadata.set(params.id, {})
      this.heartbeats.beat(params.id)
      return { registered: true }
    })
    this.server.on(IpcMethod.SelfExpose, async (req) => {
      const params = req.params as { id: string; metadata: Record<string, unknown> }
      selfMetadata.set(params.id, params.metadata)
      return { exposed: true }
    })
    this.server.on(IpcMethod.SelfAlive, async (req) => {
      const params = req.params as { id: string; timestamp: number }
      this.heartbeats.beat(params.id)
      return { ok: true }
    })

    // Reconciler
    this.server.on(IpcMethod.ReconcilerStart, async () => {
      this.reconciler.start()
      return { running: this.reconciler.running }
    })
    this.server.on(IpcMethod.ReconcilerStop, async () => {
      this.reconciler.stop()
      return { running: this.reconciler.running }
    })
    this.server.on(IpcMethod.ReconcilerStatus, async () => {
      return { running: this.reconciler.running }
    })

    // Daemon control
    this.server.on(IpcMethod.DaemonStatus, async () => {
      return {
        pid: process.pid,
        uptime: this.uptime,
        startedAt: this._startedAt,
        reconcilerRunning: this.reconciler.running,
        runtimes: this.runtimeService.listRunning().length,
        registered: await this.registry.listIds(),
      }
    })
    this.server.on(IpcMethod.DaemonShutdown, async () => {
      // Respond first so the client gets the ack before the process exits
      const info = {
        pid: process.pid,
        uptime: this.uptime,
        runtimes: this.runtimeService.listRunning().length,
      }

      // Schedule shutdown after responding
      setImmediate(async () => {
        await this.shutdown()
        process.exit(0)
      })

      return { shuttingDown: true, ...info }
    })
  }

  private setupSignalHandlers(): void {
    const handleSignal = async () => {
      await this.shutdown()
      process.exit(0)
    }

    process.on('SIGINT', handleSignal)
    process.on('SIGTERM', handleSignal)
  }
}
