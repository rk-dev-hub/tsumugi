// 結合テストの環境。開発用 DB を壊さないよう、名前が _test で終わる DB だけを使う。
import "dotenv/config";

const isTestDb = (u: string | undefined) =>
  Boolean(u && /\/[^/?]+_test(\?|$)/.test(u));
const current = process.env.DATABASE_URL;
const base =
  process.env.TEST_DATABASE_URL ??
  (isTestDb(current)
    ? current
    : current?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2"));
if (!base || !isTestDb(base)) {
  throw new Error(
    "結合テストには名前が _test で終わる DB を使います（TEST_DATABASE_URL を設定してください）",
  );
}
process.env.DATABASE_URL = base;
process.env.TSUMUGI_TODAY = "2026-11-25";
process.env.ANTHROPIC_API_KEY = "";
process.env.TSUMUGI_FAKE = "0";
