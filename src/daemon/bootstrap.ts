import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SocketClient } from '../ipc/socket-client'
import type { Registry } from './registry'

const DEFAULT_POLL_INTERVAL = 100
const DEFAULT_TIMEOUT = 5000

async function socketExists(socketPath: string): Promise<boolean> {
  try {
    await access(socketPath)
    return true
  } catch {
    return false
  }
}

/**
 * Detect the harbord CLI entry point.
 */
function detectDaemonEntry(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)
    
    const possiblePaths: string[] = []

    // 1. If we are in dist/esm/daemon/bootstrap.js, the CLI is at dist/cjs/cli.cjs
    if (currentFile.includes(join('dist', 'esm'))) {
      possiblePaths.push(resolve(currentDir, '..', '..', 'cjs', 'cli.cjs'))
    }
    
    // 2. Fallback for development: look for src/cli.ts relative to known locations
    possiblePaths.push(resolve(process.cwd(), 'src', 'cli.ts'))
    possiblePaths.push(resolve(process.cwd(), '..', '..', 'src', 'cli.ts')) // for examples

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p
      }
    }

    return resolve(process.argv[1] ?? '')
  } catch {
    return resolve(process.argv[1] ?? '')
  }
}

import { existsSync } from 'node:fs'

async function spawnDaemon(entryOverride?: string, homeDir?: string): Promise<void> {
  const entry = entryOverride ?? detectDaemonEntry()
  console.log(`[harbord] Bootstrapping daemon using entry: ${entry}`)

  if (!entry || !existsSync(entry)) {
    throw new Error(`Cannot find daemon entry point: ${entry}. Try providing 'daemonEntry' in Harbor options.`)
  }

  // Use bun if it's a .ts file, otherwise use node
  const execPath = entry.endsWith('.ts') ? 'bun' : process.execPath
  const args = entry.endsWith('.ts') ? ['run', entry, '--daemon'] : [entry, '--daemon']

  console.log(`[harbord] Executing: ${execPath} ${args.join(' ')}`)

  const child = spawn(execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(homeDir ? { HARBORD_HOME: homeDir } : {}),
    },
  })

  child.unref()
  console.log(`[harbord] Daemon spawned (PID: ${child.pid}). Waiting for socket...`)
}

async function waitForSocket(
  socketPath: string,
  timeout = DEFAULT_TIMEOUT,
  interval = DEFAULT_POLL_INTERVAL,
): Promise<void> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (await socketExists(socketPath)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, interval))
  }

  throw new Error(
    `Timed out waiting for daemon socket after ${timeout}ms: ${socketPath}`,
  )
}

export async function connectOrBootstrap(
  registry: Registry,
  options: { timeout?: number; autoBootstrap?: boolean; daemonEntry?: string } = {},
): Promise<SocketClient> {
  const { timeout, autoBootstrap = true, daemonEntry } = options
  const client = new SocketClient(registry.getSocketPath())

  // Try connecting directly first
  try {
    await client.connect()
    return client
  } catch {
    // Daemon not running
  }

  if (!autoBootstrap) {
    throw new Error(`Daemon not running at ${registry.getSocketPath()} and autoBootstrap is disabled.`)
  }

  // Check for stale lock
  const lockMtime = await registry.getLockMtime()
  if (lockMtime > 0) {
    const age = Date.now() - lockMtime
    // If lock exists but we couldn't connect, and it's older than 10s, it might be stale
    if (age > 10000) {
      console.warn(`[harbord] Found potentially stale bootstrap lock (age: ${Math.round(age / 1000)}s). Cleaning up...`)
      await registry.releaseBootstrapLock()
    }
  }

  // Try to become the bootstrap leader
  const isLeader = await registry.acquireBootstrapLock()

  if (isLeader) {
    try {
      await spawnDaemon(daemonEntry, registry.baseDir)
      await waitForSocket(registry.getSocketPath(), timeout)
    } catch (error) {
      await registry.releaseBootstrapLock()
      throw error
    }
  } else {
    // Another process is bootstrapping — wait for it
    console.log(`[harbord] Another process is bootstrapping. Waiting for socket...`)
    await waitForSocket(registry.getSocketPath(), timeout)
  }

  // Connect to the now-running daemon
  await client.connect()
  return client
}
