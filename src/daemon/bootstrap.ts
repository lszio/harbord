import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
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
 * In production (bundled), it should be sibling to index.js in dist/cjs.
 * We look for cli.cjs in the sibling cjs directory if we are in esm.
 */
function detectDaemonEntry(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url)
    const currentDir = dirname(currentFile)
    
    // If we are in dist/esm/index.js, the CLI is at dist/cjs/cli.cjs
    if (currentFile.includes(join('dist', 'esm'))) {
      return join(currentDir, '..', 'cjs', 'cli.cjs')
    }
    
    // Fallback for development (if running via bun/ts-node)
    return join(process.cwd(), 'src', 'cli.ts')
  } catch {
    return process.argv[1] ?? ''
  }
}

async function spawnDaemon(entryOverride?: string, homeDir?: string): Promise<void> {
  const entry = entryOverride ?? detectDaemonEntry()
  if (!entry) {
    throw new Error('Cannot determine entry point for daemon')
  }

  // Use bun if it's a .ts file, otherwise use node
  const execPath = entry.endsWith('.ts') ? 'bun' : process.execPath
  const args = entry.endsWith('.ts') ? ['run', entry, '--daemon'] : [entry, '--daemon']

  const child = spawn(execPath, args, {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      ...(homeDir ? { HARBORD_HOME: homeDir } : {}),
    },
  })

  child.unref()
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
    await waitForSocket(registry.getSocketPath(), timeout)
  }

  // Connect to the now-running daemon
  await client.connect()
  return client
}
