import { defineConfig } from '@playwright/test'

const frontendUrl = 'http://127.0.0.1:5174'
const backendUrl = 'http://127.0.0.1:3211'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node backend/scripts/start-e2e-server.js',
      url: `${backendUrl}/api/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        PORT: '3211',
        CORS_ORIGIN: frontendUrl,
      },
    },
    {
      command: 'npm run dev -w frontend -- --host 127.0.0.1 --port 5174 --strictPort',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: backendUrl,
      },
    },
  ],
})
