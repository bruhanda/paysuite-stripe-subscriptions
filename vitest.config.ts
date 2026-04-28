import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/**/*.test.ts',
        'src/__tests__/**',
        'src/testing/**',
        'src/version.ts',
      ],
    },
  },
});
