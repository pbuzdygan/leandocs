import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Follows the server's PORT so `PORT=9000 pnpm dev` works for both apps.
const apiTarget = process.env.LEANDOCS_API_URL ?? `http://localhost:${process.env.PORT ?? 8080}`;
// Release builds report the published version (e.g. `dev1.2.0`); see packages/shared/src/version.ts.
const releaseVersion = process.env.LEANDOCS_VERSION;

export default defineConfig({
  plugins: [react()],
  define: releaseVersion ? { __LEANDOCS_VERSION__: JSON.stringify(releaseVersion) } : {},
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
