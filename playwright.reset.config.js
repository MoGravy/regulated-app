import base from './playwright.config.js'
export default {
  ...base,
  globalSetup: undefined,
  testMatch: 'quick-reset.spec.js',
  outputDir: '/tmp/reset-results',
  reporter: 'list',
  timeout: 20000,
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit', isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
  use: { ...base.use, baseURL: 'http://localhost:4381', storageState: undefined },
  webServer: {
    command: 'VITE_SUPABASE_URL=https://local-preview.supabase.invalid VITE_SUPABASE_ANON_KEY=preview-public-only VITE_STRIPE_PUBLISHABLE_KEY=pk_test_local npm run build && npm run preview -- --host 127.0.0.1 --port 4381 --strictPort',
    url: 'http://localhost:4381', reuseExistingServer: false, timeout: 180000,
  },
}
