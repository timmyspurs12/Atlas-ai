import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 4173,
    proxy: {
      '/v1': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: { host: '0.0.0.0', port: 4173 },
  esbuild: { jsx: 'automatic' },
  build: { sourcemap: true, target: 'es2022' },
});
