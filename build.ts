import { rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const SDK_ENTRY = 'src/index.ts'
const CLI_ENTRY = 'src/cli.ts'
const OUT_DIR = 'dist'

async function clean(): Promise<void> {
  if (existsSync(OUT_DIR)) {
    await rm(OUT_DIR, { recursive: true })
  }
}

async function buildEsm(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [SDK_ENTRY, CLI_ENTRY],
    outdir: `${OUT_DIR}/esm`,
    target: 'node',
    format: 'esm',
    sourcemap: 'external',
  })

  if (!result.success) {
    console.error('ESM build failed:')
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  // Add shebang to CLI entry for direct execution
  const cliOut = `${OUT_DIR}/esm/cli.js`
  const cliContent = await Bun.file(cliOut).text()
  await writeFile(cliOut, '#!/usr/bin/env node\n' + cliContent)

  console.log(`esm  → ${OUT_DIR}/esm/ (${result.outputs.length} outputs)`)
}

async function buildCjs(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [SDK_ENTRY, CLI_ENTRY],
    outdir: `${OUT_DIR}/cjs`,
    target: 'node',
    format: 'cjs',
    sourcemap: 'external',
  })

  if (!result.success) {
    console.error('CJS build failed:')
    for (const log of result.logs) console.error(log)
    process.exit(1)
  }

  // Add shebang to CLI entry
  const cliOut = `${OUT_DIR}/cjs/cli.js`
  const cliContent = await Bun.file(cliOut).text()
  await writeFile(cliOut, '#!/usr/bin/env node\n' + cliContent)

  console.log(`cjs  → ${OUT_DIR}/cjs/ (${result.outputs.length} outputs)`)
}

async function buildTypes(): Promise<void> {
  execSync('tsc --project tsconfig.build.json --declaration --emitDeclarationOnly --outDir dist/types', {
    stdio: 'inherit',
  })
  console.log('types → dist/types/')
}

async function main(): Promise<void> {
  const start = performance.now()

  await clean()
  await buildEsm()
  await buildCjs()
  await buildTypes()

  const elapsed = ((performance.now() - start) / 1000).toFixed(2)
  console.log(`\n✓ build complete (${elapsed}s)`)
}

await main()
