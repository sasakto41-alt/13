import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  css: {
    postcss: { plugins: [] },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
