import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pricepulse/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    // So phones on the same Wi‑Fi can open http://<your-LAN-IP>:5173 (QR_MENU_PUBLIC_URL).
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/menu': { target: 'http://localhost:3001', changeOrigin: true },
      '/sse': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true, changeOrigin: true },
    },
  },
});
