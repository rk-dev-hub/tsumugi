import { defineConfig, devices } from "@playwright/test";
import "dotenv/config";

// E2E は PostgreSQL が必要。名前が _e2e で終わる DB を global-setup で作り直し、体験用データを入れる。
// AI は呼ばず、決まった応答を返すフェイク（TSUMUGI_FAKE=1）で動かす。日付は 2026-11-25 に固定する。
const PORT = 3399;
const dbUrl =
  process.env.E2E_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "").replace(/\/([^/?]+)(\?|$)/, "/$1_e2e$2");
process.env.E2E_DATABASE_URL = dbUrl;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // インストール済みの Chromium を使う場合はパスを指定する
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    env: {
      DATABASE_URL: dbUrl,
      TSUMUGI_FAKE: "1",
      TSUMUGI_TODAY: "2026-11-25",
      AUTH_URL: `http://localhost:${PORT}`,
      APP_URL: `http://localhost:${PORT}`,
    },
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
