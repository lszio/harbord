/**
 * Test helper: a simple process that writes to stdout/stderr.
 * Runs until killed. No signal handlers (avoids uv_signal_start EINVAL in Bun).
 */
let count = 0
const id = setInterval(() => {
  count++
  process.stdout.write(`alive ${count}\n`)
  if (count === 1) {
    process.stderr.write('started\n')
  }
}, 100)
