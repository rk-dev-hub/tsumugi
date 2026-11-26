import { defineConfig } from "vitest/config";

// DB を使う結合テスト。docker compose の PostgreSQL に、名前が _test で終わる DB を用意して使う。
// pnpm test:integration で実行（通常の pnpm test には含めない）。
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    setupFiles: ["tests/integration/env.ts"],
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
