import { defineConfig } from '@playwright/test';
import { baseURL, executablePath, projectRoot, resultsDirectory } from './environment.mjs';

const suppliedURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL;
// The hosted workspace owns its preview. On a user checkout the default test
// command starts one disposable, loopback-only instance of the built app.
const localServer = !suppliedURL && process.env.SITES_MANAGED_LINUX_CONTAINER !== '1';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.mjs',
  outputDir: resultsDirectory,
  timeout: 35_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: { executablePath },
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: localServer
    ? {
        command: 'npm run build && node server/node.mjs',
        cwd: projectRoot,
        url: baseURL + '/api/health',
        env: { ...process.env, PORT: '4179', HOST: '127.0.0.1', DATABASE_PATH: ':memory:' },
        reuseExistingServer: false,
        timeout: 90_000,
      }
    : undefined,
});
