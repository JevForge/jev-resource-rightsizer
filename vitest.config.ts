import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/collectors/types.ts',
        'src/jev/**',
        'src/core/index.ts',
        'src/core/jev/types.ts',
        'src/core/jev/typesafe-native.ts',
        'src/core/jev/custom-compatible.ts',
        'src/core/jev/vercel-ai-gateway.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 55,
      },
    },
  },
});
