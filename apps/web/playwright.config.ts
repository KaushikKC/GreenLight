import path from "node:path";

import { defineConfig } from "@playwright/test";

// Happy path needs Postgres + MinIO running (`make infra && make migrate`).
// Runs against a production build on its own port, so a long-lived `next dev`
// (and its HMR cache) never leaks into the test.
// The worker runs with saved AI answers (replay) so the run is free and
// deterministic.
const analyzer = path.resolve(__dirname, "../../services/analyzer");

export default defineConfig({
  testDir: "./e2e",
  timeout: 4 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
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
      command: "pnpm build && pnpm start --port 3100",
      url: "http://localhost:3100/api/jobs",
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      command: `cd "${analyzer}" && uv run python -m analyzer.worker 2>&1`,
      wait: { stdout: /worker started/ },
      // Replay mode: contract extraction answers from e2e/replay; everything
      // else the AI would judge shows "couldn't check". No key, no cost.
      env: {
        ANTHROPIC_API_KEY: "",
        GEMINI_API_KEY: "",
        LLM_PROVIDER: "replay",
        LLM_REPLAY_DIR: path.resolve(__dirname, "e2e/replay"),
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
