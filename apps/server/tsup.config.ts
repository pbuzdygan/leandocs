import { defineConfig } from 'tsup';

// Release builds report the published version (e.g. `dev1.2.0`); see packages/shared/src/version.ts.
const releaseVersion = process.env.LEANDOCS_VERSION;

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (consumed as TS source); keep npm deps external.
  noExternal: ['@leandocs/shared'],
  define: releaseVersion ? { __LEANDOCS_VERSION__: JSON.stringify(releaseVersion) } : {},
});
