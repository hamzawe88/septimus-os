import { defineConfig, devices } from '@playwright/test';

// macOS developer machines normally ship Chrome but not Playwright's separate
// headless shell. CI keeps its managed browser; local E2E stays runnable
// without downloading a second 170 MB browser archive.
const localChromeChannel = process.env.PLAYWRIGHT_CHANNEL ||
  (process.platform === 'darwin' ? 'chrome' : undefined);

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 180_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      ...(localChromeChannel ? { channel: localChromeChannel } : {}),
    },
  }],
});
