import { SocketClient } from '../ipc/socket-client'

export class Self {
  private running = true

  constructor(
    private client: SocketClient,
    private runtimeId: string,
  ) {}

  get id(): string {
    return this.runtimeId
  }

  async expose(metadata: Record<string, unknown>): Promise<void> {
    await this.client.request('self.expose', {
      id: this.runtimeId,
      metadata,
    })
  }

  async alive(): Promise<void> {
    if (!this.running) return
    await this.client.request('self.alive', {
      id: this.runtimeId,
      timestamp: Date.now(),
    })
  }

  async shutdown(): Promise<void> {
    this.running = false
  }
}
