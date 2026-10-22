import { defineConfig } from '@playwright/test'

const port = 5189

export default defineConfig({
  testDir: 'browser-tests',
  testMatch: '*.pw.ts',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm --filter playground exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/connect-stand.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
})
