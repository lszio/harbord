import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { RuntimeState } from '../core/runtime-state'
import type { RuntimeSpec } from '../core/runtime-spec'

export class Registry {
  readonly baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? process.env.HARBORD_HOME ?? join(homedir(), '.harbord')
  }

  async init(): Promise<void> {
    await mkdir(this.baseDir, { recursive: true })
    await mkdir(this.stateDir, { recursive: true })
    await mkdir(this.logsDir, { recursive: true })
  }

  async saveState(id: string, state: RuntimeState): Promise<void> {
    const filePath = this.statePath(id)
    const tmpPath = filePath + '.tmp'
    await writeFile(tmpPath, JSON.stringify(state), 'utf-8')
    await rename(tmpPath, filePath)
  }

  async loadState(id: string): Promise<RuntimeState | null> {
    const filePath = this.statePath(id)
    try {
      const data = await readFile(filePath, 'utf-8')
      return JSON.parse(data) as RuntimeState
    } catch {
      return null
    }
  }

  async saveSpec(id: string, spec: RuntimeSpec): Promise<void> {
    const filePath = this.specPath(id)
    const tmpPath = filePath + '.tmp'
    await writeFile(tmpPath, JSON.stringify(spec), 'utf-8')
    await rename(tmpPath, filePath)
  }

  async loadSpec(id: string): Promise<RuntimeSpec | null> {
    const filePath = this.specPath(id)
    try {
      const data = await readFile(filePath, 'utf-8')
      return JSON.parse(data) as RuntimeSpec
    } catch {
      return null
    }
  }

  async removeSpec(id: string): Promise<void> {
    const filePath = this.specPath(id)
    await unlink(filePath).catch(() => {})
  }

  async removeState(id: string): Promise<void> {
    const filePath = this.statePath(id)
    await unlink(filePath).catch(() => {})
  }

  async listIds(): Promise<string[]> {
    const files = await readdir(this.stateDir)
    return files
      .filter((f) => f.endsWith('.json') && !f.endsWith('.spec.json'))
      .map((f) => f.slice(0, -5))
  }

  async acquireBootstrapLock(): Promise<boolean> {
    const lockPath = this.bootstrapLockPath
    try {
      await mkdir(lockPath)
      return true
    } catch {
      return false
    }
  }

  async releaseBootstrapLock(): Promise<void> {
    await rm(this.bootstrapLockPath, { recursive: true, force: true })
  }

  /**
   * Get the modification time of the bootstrap lock.
   */
  async getLockMtime(): Promise<number> {
    try {
      const s = await stat(this.bootstrapLockPath)
      return s.mtimeMs
    } catch {
      return 0
    }
  }

  getSocketPath(): string {
    return join(this.baseDir, 'runtime.sock')
  }

  private get stateDir(): string {
    return join(this.baseDir, 'state')
  }

  private get logsDir(): string {
    return join(this.baseDir, 'logs')
  }

  private get bootstrapLockPath(): string {
    return join(this.baseDir, 'bootstrap.lock')
  }

  private statePath(id: string): string {
    return join(this.stateDir, `${id}.json`)
  }

  private specPath(id: string): string {
    return join(this.stateDir, `${id}.spec.json`)
  }
}
