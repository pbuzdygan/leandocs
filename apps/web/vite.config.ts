import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Follows the server's PORT so `PORT=9000 pnpm dev` works for both apps.
const apiTarget = process.env.LEANDOCS_API_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': apiTarget,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Mermaid's lazily loaded chunks are large by nature; the app shell stays small.
    chunkSizeWarningLimit: 1600,
  },
});
