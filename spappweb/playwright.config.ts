import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "cliente",
      testMatch: /cliente\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visitador",
      testMatch: /visitador\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "resilience",
      testMatch: /resilience\.spec\.ts/,
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
