import type { RuntimeService } from '../runtime/runtime-service'

export const DEFAULT_RECONCILE_INTERVAL = 5000

export class Reconciler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private _running = false

  constructor(
    private runtimeService: RuntimeService,
    private interval = DEFAULT_RECONCILE_INTERVAL,
  ) {}

  get running(): boolean {
    return this._running
  }

  start(): void {
    if (this._running) return
    this._running = true
    this.schedule()
  }

  stop(): void {
    this._running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private schedule(): void {
    if (!this._running) return
    this.timer = setTimeout(() => this.tick(), this.interval)
  }

  private async tick(): Promise<void> {
    if (!this._running) return

    try {
      await this.reconcile()
    } catch {
      // Swallow reconciler errors to keep the loop alive
    }

    this.schedule()
  }

  private async reconcile(): Promise<void> {
    for (const id of this.runtimeService.listRunning()) {
      const spec = this.runtimeService.getSpec(id)
      if (!spec) continue

      const state = await this.runtimeService.inspect(id)

      // Restart if crashed
      if (state && state.status === 'crashed') {
        await this.runtimeService.start(spec)
        continue
      }

      // Check conditions
      if (spec.conditions && state) {
        for (const condition of spec.conditions) {
          try {
            const ok = await condition.check(spec, state)
            if (!ok) {
              await this.runtimeService.stop(id)
              break
            }
          } catch {
            await this.runtimeService.stop(id)
            break
          }
        }
      }
    }
  }
}
