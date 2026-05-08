import { Registry } from './registry'
import { SocketServer } from '../ipc/socket-server'
import { IpcMethod } from '../ipc/protocol'

export class Daemon {
  private registry: Registry
  private server: SocketServer

  constructor(baseDir?: string) {
    this.registry = new Registry(baseDir)
    this.server = new SocketServer(this.registry)
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
    this.server.on(IpcMethod.RegistryList, async () => {
      return this.registry.listIds()
    })

    this.server.on(IpcMethod.RegistryGet, async (req) => {
      const params = req.params as { id: string }
      return this.registry.loadState(params.id)
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
