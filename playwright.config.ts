import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.CUBE_GUIDE_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:5187',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: externalBaseUrl ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5187',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
