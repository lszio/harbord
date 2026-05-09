export const DEFAULT_HEARTBEAT_TIMEOUT = 30_000

/**
 * Tracks `self.alive()` heartbeats from running workers.
 * Used by the Reconciler to detect and clean up orphaned runtimes.
 */
export class HeartbeatTracker {
  private beats = new Map<string, number>()

  constructor(readonly timeout: number = DEFAULT_HEARTBEAT_TIMEOUT) {}

  /** Record a heartbeat from a runtime worker. */
  beat(id: string): void {
    this.beats.set(id, Date.now())
  }

  /** Remove heartbeat tracking for a runtime (e.g. on graceful stop). */
  clear(id: string): void {
    this.beats.delete(id)
  }

  /** Whether the runtime has missed enough heartbeats to be considered dead. */
  isExpired(id: string): boolean {
    const last = this.beats.get(id)
    if (last === undefined) return true
    return Date.now() - last > this.timeout
  }

  /** Get all runtime IDs that have sent recent heartbeats. */
  getAliveIds(): string[] {
    const now = Date.now()
    const alive: string[] = []
    for (const [id, last] of this.beats) {
      if (now - last <= this.timeout) {
        alive.push(id)
      }
    }
    return alive
  }

  /** Remove all expired heartbeats and return their IDs. */
  purgeExpired(): string[] {
    const now = Date.now()
    const expired: string[] = []
    for (const [id, last] of this.beats) {
      if (now - last > this.timeout) {
        expired.push(id)
      }
    }
    for (const id of expired) {
      this.beats.delete(id)
    }
    return expired
  }
}
