import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    // On a Windows/macOS drive bind-mounted into Docker, native file events
    // (inotify) don't fire, so HMR misses edits. Poll instead. Toggled by
    // WATCH_POLLING (set in docker-compose.override.yml); unset = native.
    watch: {
      usePolling: process.env.WATCH_POLLING === 'true',
      interval: 300,
    },
  },
});
