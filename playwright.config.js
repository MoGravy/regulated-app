import { defineConfig, devices } from '@playwright/test'
import { STATE_PATH } from './tests/preview-auth.js'

// BASE_URL picks the target:
//   local production build (default) — vite preview, no /api routes
//   a Vercel preview URL            — real /api, real Supabase, real Stripe
const BASE_URL = process.env.BASE_URL || 'http://localhost:4173'
const IS_LOCAL = BASE_URL.includes('localhost')

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
    // Mobile first, at the width the design is drawn at.
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    // The preview bypass rides on a cookie, not a header, so it is never sent
    // to third-party origins like fonts.gstatic.com.
    // globalSetup writes this before any context is created, and throws if it
    // cannot, so the path is safe to name unconditionally.
    storageState: IS_LOCAL ? undefined : STATE_PATH,
  },
  // Only boot a server when pointed at localhost.
  webServer: IS_LOCAL
    ? {
        command: 'npm run build && npm run preview -- --port 4173',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
})
