import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
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

function getEntryPoint(): string {
  return process.argv[1] ?? ''
}

async function spawnDaemon(): Promise<void> {
  const entry = getEntryPoint()
  if (!entry) {
    throw new Error('Cannot determine entry point for daemon')
  }

  const child = spawn(process.execPath, [entry, '--daemon'], {
    detached: true,
    stdio: 'ignore',
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
  timeout?: number,
): Promise<SocketClient> {
  const client = new SocketClient(registry.getSocketPath())

  // Try connecting directly first
  try {
    await client.connect()
    return client
  } catch {
    // Daemon not running, need to bootstrap
  }

  // Try to become the bootstrap leader
  const isLeader = await registry.acquireBootstrapLock()

  if (isLeader) {
    try {
      await spawnDaemon()
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
