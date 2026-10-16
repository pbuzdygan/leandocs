import react from '@vitejs/plugin-react';
import { defineProject } from 'vitest/config';

export default defineProject({
  plugins: [react()],
  test: {
    name: 'web',
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Above the 5 s `findBy…` limit in setup.ts, so a slow wait reports what it waited for.
    testTimeout: 15_000,
  },
});
