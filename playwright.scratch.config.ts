import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: 'tests-scratch', timeout: 90000, projects: [{ name: 'galaxy', use: { ...devices['Galaxy S9+'], channel: 'chrome', launchOptions: { args: ['--host-resolver-rules=MAP call.cdsrv.com 172.67.144.240'] } } }] });
