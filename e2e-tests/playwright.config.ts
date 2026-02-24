import { defineConfig, devices } from "@playwright/test";

const authStoragePath = "tests/.auth/seed-user.json";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "rest",
      use: {
        storageState: authStoragePath,
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
