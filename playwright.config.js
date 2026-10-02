import { defineConfig, devices } from '@playwright/test'
import { STATE_PATH } from './tests/preview-auth.js'
import { BASE_URL, IS_LOCAL, LOCAL_BUILD_ENV } from './tests/runtime.js'

// BASE_URL picks the target:
// Local runs use synthetic services. Remote runs require explicit settings.

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/preview-auth.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 45_000,
  use: {
    baseURL: BASE_URL,
    colorScheme: 'light',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Mobile first, at the width the design is drawn at.
    viewport: { width: 390, height: 844 },
    // The preview bypass rides on a cookie, not a header, so it is never sent
    // to third-party origins like fonts.gstatic.com.
    // globalSetup writes this before any context is created, and throws if it
    // cannot, so the path is safe to name unconditionally.
    storageState: IS_LOCAL ? undefined : STATE_PATH,
    serviceWorkers: IS_LOCAL ? 'block' : 'allow',
  },
  // Only boot a server when pointed at localhost.
  webServer: IS_LOCAL
    ? {
        command: `npm run build -- --outDir .tmp/test-build && npm run preview -- --outDir .tmp/test-build --host ${new URL(BASE_URL).hostname === '[::1]' ? '::1' : '127.0.0.1'} --port ${new URL(BASE_URL).port || 4173} --strictPort`,
        url: BASE_URL,
        env: LOCAL_BUILD_ENV,
        reuseExistingServer: false,
        timeout: 180_000,
      }
    : undefined,
})
