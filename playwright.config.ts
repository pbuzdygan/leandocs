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

/**
 * Screenshot tests (P16-06) compare against baselines rendered by Chromium in the official
 * Playwright image (as in CI); fonts render slightly differently elsewhere. They run there, or
 * anywhere with `E2E_VISUAL=1`.
 */
const visual =
  browser === 'chromium' &&
  (process.env.PLAYWRIGHT_BROWSERS_PATH === '/ms-playwright' || process.env.E2E_VISUAL === '1');

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
      testIgnore: /(?:setup|proxy-auth|none-auth|mfa|visual)\.spec\.ts/,
      dependencies: ['setup'],
    },
    ...(visual
      ? [
          {
            name: 'visual-setup',
            testMatch: /visual\.setup\.ts/,
            use: { ...device, baseURL: 'http://127.0.0.1:18770' },
          },
          {
            name: 'visual',
            testMatch: /visual\.spec\.ts/,
            use: {
              ...device,
              baseURL: 'http://127.0.0.1:18770',
              storageState: 'test-results/visual-auth-state.json',
            },
            dependencies: ['visual-setup'],
          },
        ]
      : []),
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
    ...(visual
      ? [
          {
            command: 'node e2e/server.mjs',
            url: 'http://127.0.0.1:18770/api/v1/health',
            env: { PORT: '18770', AUTH_MODE: 'local', E2E_VISUAL: '1' },
            reuseExistingServer: false,
            timeout: 30_000,
          },
        ]
      : []),
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
