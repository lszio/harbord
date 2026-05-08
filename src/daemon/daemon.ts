import { Registry } from './registry'
import { SocketServer } from '../ipc/socket-server'
import { IpcMethod } from '../ipc/protocol'
import { NodeProcessBackend } from '../backend/node-process-backend'
import { RuntimeService } from '../runtime/runtime-service'

export class Daemon {
  private registry: Registry
  private server: SocketServer
  private runtimeService: RuntimeService

  constructor(baseDir?: string) {
    this.registry = new Registry(baseDir)
    this.server = new SocketServer(this.registry)
    this.runtimeService = new RuntimeService(new NodeProcessBackend(), this.registry)
  }

  async start(): Promise<void> {
    await this.registry.init()
    this.setupHandlers()

    this.server.start()
    await this.server.listen()

    this.setupSignalHandlers()
  }

  async shutdown(): Promise<void> {
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
