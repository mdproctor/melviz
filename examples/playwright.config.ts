import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:8081",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx http-server dist -c-1 -p 8081 --silent",
    port: 8081,
    reuseExistingServer: true,
  },
});
