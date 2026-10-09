import { defineConfig } from 'vitest/config';

// Domain and storage tests run in plain Node against the sql.js adapter. Nothing here needs a DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    // Tests in a US timezone catch the "YYYY-MM-DD parsed as UTC" class of bug; CI sets TZ too.
    env: { TZ: process.env.TZ ?? 'America/Chicago' },
  },
});
