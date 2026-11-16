import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// En développement, le navigateur parle à Vite (5173) qui relaie /api vers le backend (3001).
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': { target: process.env.API_URL || 'http://127.0.0.1:3001', changeOrigin: true } } },
  build: { outDir: 'dist' }
});
