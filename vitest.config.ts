import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    // 単体テストは DB に接続しない。環境変数の検証を通すためのダミー値
    env: {
      DATABASE_URL: "postgresql://unit:unit@localhost:1/unit",
      AUTH_SECRET: "unit-test-only-secret-0123456789abcdef",
      ANTHROPIC_API_KEY: "",
      TSUMUGI_FAKE: "0",
    },
    include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/features/**/domain/**", "src/lib/**"],
      reporter: ["text", "html"],
    },
  },
});
