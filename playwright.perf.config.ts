import { defineConfig } from '@playwright/test'

const port = 5188

export default defineConfig({
  testDir: 'perf',
  testMatch: '*.pw.ts',
  timeout: 600_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `pnpm --filter playground exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}/bench.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
