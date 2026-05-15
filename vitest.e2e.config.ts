import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: [
      'e2e/**/*.test.ts',
      'examples/**/test/**/*.test.ts'
    ],
    testTimeout: 60000,
    hookTimeout: 30000,
    retry: 0,
    // Use sequential execution for E2E tests to avoid daemon conflicts
    fileParallelism: false,
    maxWorkers: 5,
  },
})
