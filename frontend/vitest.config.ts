import path from 'path';
import { defineConfig } from 'vitest/config';

// Dedicated Vitest config (kept separate from vite.config.ts so tests don't pull in the
// React/Tailwind/Rolldown build pipeline). Current tests are pure logic, so the default
// node environment is enough — switch `environment` to 'jsdom' if component tests are added.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
