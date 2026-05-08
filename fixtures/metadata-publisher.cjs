/**
 * E2E fixture: writes JSON metadata to stdout, then stays alive.
 * Simulates a worker that announces its port.
 */
const meta = { port: 39123, protocol: 'http' }
process.stdout.write(JSON.stringify(meta) + '\n')

let count = 0
setInterval(() => {
  count++
  process.stdout.write('heartbeat ' + count + '\n')
}, 200)
