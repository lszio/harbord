let count = 0
const id = setInterval(() => {
  count++
  process.stdout.write('alive ' + count + '\n')
  if (count === 1) {
    process.stderr.write('started\n')
  }
}, 100)
