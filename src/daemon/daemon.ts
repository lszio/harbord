import { Registry } from './registry'
import { SocketServer } from '../ipc/socket-server'
import { IpcMethod } from '../ipc/protocol'
import { NodeProcessBackend } from '../backend/node-process-backend'
import { RuntimeService } from '../runtime/runtime-service'
import { Reconciler } from '../core/reconciler'

export class Daemon {
  private registry: Registry
  private server: SocketServer
  private runtimeService: RuntimeService
  private reconciler: Reconciler

  constructor(baseDir?: string) {
    this.registry = new Registry(baseDir)
    this.server = new SocketServer(this.registry)
    this.runtimeService = new RuntimeService(new NodeProcessBackend(), this.registry)
    this.reconciler = new Reconciler(this.runtimeService)
  }

  async start(): Promise<void> {
    await this.registry.init()
    this.setupHandlers()

    this.server.start()
    await this.server.listen()

    this.reconciler.start()
    this.setupSignalHandlers()
  }

  async shutdown(): Promise<void> {
    this.reconciler.stop()
    await this.server.close()
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

    // Self registration
    const selfMetadata = new Map<string, Record<string, unknown>>()
    this.server.on(IpcMethod.SelfRegister, async (req) => {
      const params = req.params as { id: string }
      selfMetadata.set(params.id, {})
      return { registered: true }
    })
    this.server.on(IpcMethod.SelfExpose, async (req) => {
      const params = req.params as { id: string; metadata: Record<string, unknown> }
      selfMetadata.set(params.id, params.metadata)
      return { exposed: true }
    })
    this.server.on(IpcMethod.SelfAlive, async (req) => {
      const params = req.params as { id: string; timestamp: number }
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
