const { defineConfig, devices } = require("@playwright/test");

const localBaseURL = "http://127.0.0.1:4173";
const configuredBaseURL = process.env.BASE_URL || process.env.PREVIEW_URL;

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  use: {
    baseURL: configuredBaseURL || localBaseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: configuredBaseURL
    ? undefined
    : {
        command: "python3 -m http.server 4173",
        url: localBaseURL,
        reuseExistingServer: true,
        stdout: "pipe",
        stderr: "pipe",
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
