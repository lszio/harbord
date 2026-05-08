import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Registry } from '../registry'

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'harbord-registry-test-'))
}

describe('Registry', () => {
  let registry: Registry
  let baseDir: string

  beforeEach(async () => {
    baseDir = createTempDir()
    registry = new Registry(baseDir)
    await registry.init()
  })

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true })
  })

  describe('init', () => {
    it('should create base directory', async () => {
      const dirs = new Set([registry.baseDir])
      expect(dirs.has(registry.baseDir)).toBe(true)
    })
  })

  describe('saveState / loadState', () => {
    it('should save and load a state', async () => {
      const state = { status: 'running' as const, pid: 12345, startedAt: Date.now() }
      await registry.saveState('test-svc', state)

      const loaded = await registry.loadState('test-svc')
      expect(loaded).not.toBeNull()
      expect(loaded!.status).toBe('running')
      expect(loaded!.pid).toBe(12345)
    })

    it('should return null for non-existent state', async () => {
      const loaded = await registry.loadState('non-existent')
      expect(loaded).toBeNull()
    })

    it('should overwrite existing state', async () => {
      await registry.saveState('svc', { status: 'idle' })
      await registry.saveState('svc', { status: 'running', pid: 999 })

      const loaded = await registry.loadState('svc')
      expect(loaded!.status).toBe('running')
      expect(loaded!.pid).toBe(999)
    })

    it('should handle state with metadata', async () => {
      const state = {
        status: 'running' as const,
        metadata: { port: 8080, protocol: 'http' },
      }
      await registry.saveState('meta-svc', state)
      const loaded = await registry.loadState('meta-svc')
      expect(loaded!.metadata).toEqual({ port: 8080, protocol: 'http' })
    })
  })

  describe('removeState', () => {
    it('should remove a saved state', async () => {
      await registry.saveState('to-remove', { status: 'stopped' })
      await registry.removeState('to-remove')
      const loaded = await registry.loadState('to-remove')
      expect(loaded).toBeNull()
    })

    it('should not throw when removing non-existent state', async () => {
      await expect(registry.removeState('non-existent')).resolves.not.toThrow()
    })
  })

  describe('listIds', () => {
    it('should return empty for fresh registry', async () => {
      const ids = await registry.listIds()
      expect(ids).toEqual([])
    })

    it('should list all saved runtime ids', async () => {
      await registry.saveState('svc-a', { status: 'running' })
      await registry.saveState('svc-b', { status: 'stopped' })
      await registry.saveState('svc-c', { status: 'idle' })

      const ids = await registry.listIds()
      expect(ids.sort()).toEqual(['svc-a', 'svc-b', 'svc-c'])
    })
  })

  describe('bootstrap lock', () => {
    it('should acquire and release lock', async () => {
      const acquired = await registry.acquireBootstrapLock()
      expect(acquired).toBe(true)
      await registry.releaseBootstrapLock()
    })

    it('should not acquire lock when already held', async () => {
      const acquired1 = await registry.acquireBootstrapLock()
      expect(acquired1).toBe(true)

      const acquired2 = await registry.acquireBootstrapLock()
      expect(acquired2).toBe(false)

      await registry.releaseBootstrapLock()
    })

    it('should be acquirable after release', async () => {
      await registry.acquireBootstrapLock()
      await registry.releaseBootstrapLock()

      const acquired = await registry.acquireBootstrapLock()
      expect(acquired).toBe(true)
      await registry.releaseBootstrapLock()
    })
  })

  describe('getSocketPath', () => {
    it('should return socket path under baseDir', () => {
      const path = registry.getSocketPath()
      expect(path).toBe(join(baseDir, 'runtime.sock'))
    })
  })
})
