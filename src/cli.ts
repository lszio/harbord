import { Daemon } from './daemon/daemon'
import { Registry } from './daemon/registry'
import { SocketClient } from './ipc/socket-client'

function help(): void {
  console.log('harbord — Declarative Local Runtime Supervisor')
  console.log()
  console.log('Usage:')
  console.log('  harbord                       Start the daemon (foreground)')
  console.log('  harbord start                 Start the daemon')
  console.log('  harbord stop                  Stop the daemon')
  console.log('  harbord status                Check daemon status')
  console.log('  harbord restart               Restart the daemon')
  console.log('  harbord help                  Show this help')
}

async function startDaemon(): Promise<void> {
  const baseDir = process.env.HARBORD_HOME
  const daemon = new Daemon(baseDir)
  await daemon.start()

  // Keep alive until signal
  process.on('SIGINT', async () => {
    await daemon.shutdown()
    process.exit(0)
  })
  process.on('SIGTERM', async () => {
    await daemon.shutdown()
    process.exit(0)
  })
}

async function getClient(): Promise<{ client: SocketClient; registry: Registry }> {
  const registry = new Registry(process.env.HARBORD_HOME)
  await registry.init()
  const client = new SocketClient(registry.getSocketPath())
  await client.connect()
  return { client, registry }
}

async function cmdStatus(): Promise<void> {
  try {
    const { client } = await getClient()
    const info: any = await client.request('daemon.status')
    console.log(`Daemon:    running (pid ${info.pid})`)
    console.log(`Uptime:    ${(info.uptime / 1000).toFixed(1)}s`)
    console.log(`Runtimes:  ${info.runtimes} running`)
    console.log(`Reconciler: ${info.reconcilerRunning ? 'active' : 'stopped'}`)
    if (info.registered.length > 0) {
      console.log(`Registered: ${info.registered.join(', ')}`)
    }
    await client.close()
  } catch {
    console.log('Daemon: not running')
    process.exit(1)
  }
}

async function cmdStop(): Promise<void> {
  try {
    const { client } = await getClient()
    const result: any = await client.request('daemon.shutdown')
    console.log(`Shutting down daemon (pid ${result.pid}, ${result.runtimes} runtimes)`)
    await client.close()
  } catch {
    console.log('Daemon: not running')
    process.exit(1)
  }
}

async function cmdRestart(): Promise<void> {
  // Try to stop existing daemon
  try {
    const { client } = await getClient()
    await client.request('daemon.shutdown')
    await client.close()
    // Brief wait for the old process to exit
    await new Promise((r) => setTimeout(r, 500))
  } catch {
    // Not running, that's fine
  }

  await startDaemon()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  // --daemon flag still supported for internal bootstrap use
  if (args.includes('--daemon') || args.length === 0 || args[0] === 'start') {
    await startDaemon()
    return
  }

  switch (args[0]) {
    case 'status':
      await cmdStatus()
      break
    case 'stop':
      await cmdStop()
      break
    case 'restart':
      await cmdRestart()
      break
    case 'help':
    case '--help':
    case '-h':
      help()
      break
    default:
      console.error(`Unknown command: ${args[0]}`)
      help()
      process.exit(1)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Fatal:', message)
  process.exit(1)
})
