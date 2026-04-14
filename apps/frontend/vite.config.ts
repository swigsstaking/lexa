import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const LEXA_BACKEND = process.env.VITE_LEXA_BACKEND || 'http://192.168.110.59:3010';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5190,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: LEXA_BACKEND,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
