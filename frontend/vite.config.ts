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
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id: string) => {
          // React runtime — tiny but loaded first, benefits from long-term caching
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // TipTap + ProseMirror + lowlight (code-block syntax highlighting) — editor stack, admin/notes only
          if (
            id.includes('node_modules/@tiptap/') ||
            id.includes('node_modules/prosemirror-') ||
            id.includes('node_modules/lowlight') ||
            id.includes('node_modules/highlight.js')
          ) {
            return 'vendor-tiptap';
          }
          // Radix UI primitives — shared across many components
          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix';
          }
          // Clerk auth SDK
          if (id.includes('node_modules/@clerk/')) {
            return 'vendor-clerk';
          }
          // Markdown pipeline: react-markdown + rehype-* + remark-* and supporting packages
          if (
            id.includes('node_modules/react-markdown') ||
            id.includes('node_modules/rehype-') ||
            id.includes('node_modules/remark-') ||
            id.includes('node_modules/unified') ||
            id.includes('node_modules/hast') ||
            id.includes('node_modules/mdast') ||
            id.includes('node_modules/micromark') ||
            id.includes('node_modules/vfile') ||
            id.includes('node_modules/unist-') ||
            id.includes('node_modules/html-url-attributes')
          ) {
            return 'vendor-markdown';
          }
        },
      },
    },
  },
});
