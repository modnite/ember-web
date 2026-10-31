import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a scratch Hearth server with the built app in front of it (tests/serve.mjs), in the engines people use:
// WebKit (iPhone and iPad shapes), Chromium-less on purpose, and Firefox through its own runner when installed.
const base = process.env.EMBER_URL ?? 'http://localhost:18300';
export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  retries: 0,
  use: { baseURL: base, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'iphone-webkit', use: { ...devices['iPhone 14'] } },
    { name: 'ipad-webkit', use: { ...devices['iPad (gen 7)'] } },
    { name: 'desktop-webkit', use: { browserName: 'webkit', viewport: { width: 1280, height: 800 } } },
  ],
});
