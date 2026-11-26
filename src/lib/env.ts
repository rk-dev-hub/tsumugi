import { z } from "zod";

/**
 * 環境変数を起動時に検証する。未設定・不正値は明確なエラーで即座に落とす。
 * サーバー専用。クライアントから import しないこと。
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // PostgreSQL 接続文字列。公開リポジトリではダミー。各自の環境に差し替える。
  DATABASE_URL: z.string().url().startsWith("postgres"),

  // Auth.js セッション署名鍵。`openssl rand -base64 32` で生成した値に差し替える。
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET は 32 文字以上にしてください"),
  AUTH_URL: z.string().url().default("http://localhost:3300"),

  // 表示・集計のタイムゾーン。基本は固定。
  APP_TIMEZONE: z.string().default("Asia/Tokyo"),

  // CSV 既定エンコーディング。
  CSV_ENCODING: z.enum(["utf8", "utf8-bom", "shift_jis"]).default("utf8-bom"),

  APP_URL: z.string().url().default("http://localhost:3300"),

  // AI アシスタント Tsumugi。キーが空なら AI を呼ばず、テンプレート文で動く。
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  TSUMUGI_AI_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  TSUMUGI_AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(60),
  // E2E テスト用: AI の代わりに決まった応答を返す。本番では使わない。
  TSUMUGI_FAKE: z
    .enum(["0", "1"])
    .default("0")
    .transform((v) => v === "1"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(
    `環境変数の検証に失敗しました。.env を確認してください:\n${issues}`,
  );
}

export const env = parsed.data;
export type Env = typeof env;
