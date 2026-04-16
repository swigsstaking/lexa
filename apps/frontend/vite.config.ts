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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/@tanstack')) {
            return 'query-vendor';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'motion-vendor';
          }
        },
      },
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
