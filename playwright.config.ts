import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (PROJECT_SPEC §91) against the production build: run `pnpm build` first,
 * then `pnpm test:e2e`. The server uses a fresh data directory in `.e2e-data/`.
 */
const PORT = 18765;

/**
 * Browser for every project (P15-09): `E2E_BROWSER=firefox|webkit pnpm test:e2e` runs the whole
 * suite in that engine; the default is Chromium. One engine per run, because the tests share
 * fixed document names and every run starts with fresh data directories.
 */
const BROWSERS = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
};
const browser = (process.env.E2E_BROWSER ?? 'chromium') as keyof typeof BROWSERS;
const device = BROWSERS[browser];
if (!device) throw new Error(`E2E_BROWSER must be one of ${Object.keys(BROWSERS).join(', ')}`);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /setup\.spec\.ts/, use: { ...device } },
    {
      name: browser,
      use: { ...device, storageState: 'test-results/auth-state.json' },
      testIgnore: /(?:setup|proxy-auth|none-auth|mfa)\.spec\.ts/,
      dependencies: ['setup'],
    },
    {
      name: 'mfa',
      testMatch: /mfa\.spec\.ts/,
      use: { ...device, baseURL: 'http://127.0.0.1:18769' },
    },
    {
      name: 'proxy',
      testMatch: /proxy-auth\.spec\.ts/,
      use: { ...device, baseURL: 'http://127.0.0.1:18766' },
    },
    {
      name: 'none',
      testMatch: /none-auth\.spec\.ts/,
      use: { ...device, baseURL: 'http://127.0.0.1:18767' },
    },
  ],
  webServer: [
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:18769/api/v1/health',
      env: { PORT: '18769', AUTH_MODE: 'local' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node e2e/server.mjs',
      url: `http://127.0.0.1:${PORT}/api/v1/health`,
      env: { PORT: String(PORT), AUTH_MODE: 'local' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:18766/api/v1/health',
      env: {
        PORT: '18766',
        AUTH_MODE: 'proxy',
        PROXY_TRUSTED_IPS: '127.0.0.1',
        PROXY_AUTH_HEADER: 'x-auth-request-user',
        PROXY_AUTH_USER: 'owner@example.com',
      },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node e2e/server.mjs',
      url: 'http://127.0.0.1:18767/api/v1/health',
      env: { PORT: '18767', AUTH_MODE: 'none' },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
