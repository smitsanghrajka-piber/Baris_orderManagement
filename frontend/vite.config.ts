import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the API runs on :3000 (npm run start:dev at the repo root) and Vite
// proxies /api to it, so the browser only ever talks to one origin — the same
// shape as production, where NestJS serves frontend/dist itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: true },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as any);
