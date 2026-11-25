import { defineConfig, devices } from '@playwright/test'

const executablePath = process.env.LUMO_CHROMIUM
const local = process.env.LUMO_BROWSER_URL ?? 'http://127.0.0.1:3010'
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  workers: 1,
  use: { baseURL: local, trace: 'retain-on-failure' },
  webServer: process.env.LUMO_BROWSER_URL ? undefined : {
    command: 'npm run dev -- --port 3010 --strictPort',
    url: local,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'catalog-and-build', testMatch: 'builder.spec.ts', use: {
      ...devices['Desktop Chrome'], launchOptions: { executablePath, args: ['--disable-webgl'] },
    } },
    { name: 'webgl2', testMatch: 'scene.spec.ts', use: {
      ...devices['Desktop Chrome'], launchOptions: { executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    } },
  ],
})
