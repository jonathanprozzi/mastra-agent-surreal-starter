import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.mastra'],
    testTimeout: 30000, // 30s for database operations
    hookTimeout: 30000,
    setupFiles: ['./tests/setup.ts'],
    // Run tests sequentially to avoid database connection overload
    sequence: {
      shuffle: false,
    },
    fileParallelism: false, // Run test files serially
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/mastra/storage/**/*.ts', 'src/mastra/vector/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
