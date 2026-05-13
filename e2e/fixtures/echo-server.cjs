/**
 * E2E fixture: a simple process that writes to stdout/stderr every 100ms.
 * Plain CJS so it runs under any Node.js without transpilation.
 */
let count = 0
const id = setInterval(() => {
  count++
  process.stdout.write('alive ' + count + '\n')
  if (count === 1) {
    process.stderr.write('started\n')
  }
}, 100)
