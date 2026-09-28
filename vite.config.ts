import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    allowedHosts: true,
    cors: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
