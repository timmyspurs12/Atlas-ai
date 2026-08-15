import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e.setup.ts'],
    fileParallelism: false,
    maxConcurrency: 1,
    maxWorkers: 1,
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
