import { Daemon } from './daemon/daemon'

async function main(): Promise<void> {
  if (process.argv.includes('--daemon')) {
    const baseDir = process.env.HARBORD_HOME
    const daemon = new Daemon(baseDir)
    await daemon.start()
    return
  }

  console.log('harbord — Declarative Local Runtime Supervisor')
  console.log()
  console.log('Usage:')
  console.log('  bun run src/cli.ts --daemon    Start the harbord daemon')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Fatal:', message)
  process.exit(1)
})
