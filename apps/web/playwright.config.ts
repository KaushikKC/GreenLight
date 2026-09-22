import path from "node:path";

import { defineConfig } from "@playwright/test";

// Happy path needs Postgres + MinIO running (`make infra && make migrate`).
// The worker is started with AI review disabled so the run is free and
// deterministic; AI-judged checks show "couldn't check".
const analyzer = path.resolve(__dirname, "../../services/analyzer");

export default defineConfig({
  testDir: "./e2e",
  timeout: 4 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    // Uses the installed Google Chrome: no browser download needed.
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000/api/jobs",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `cd "${analyzer}" && uv run python -m analyzer.worker 2>&1`,
      wait: { stdout: /worker started/ },
      env: { ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "", LLM_PROVIDER: "" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
