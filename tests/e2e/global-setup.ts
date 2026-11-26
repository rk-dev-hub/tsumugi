import { execSync } from "node:child_process";
import pg from "pg";

/** E2E 用 DB を用意し、体験用データを入れ直す（日付は 2026-11-25 に固定） */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "";
  if (!/\/[^/?]+_e2e(\?|$)/.test(url))
    throw new Error("E2E には名前が _e2e で終わる DB を使います");
  const u = new URL(url);
  const name = u.pathname.slice(1);
  u.pathname = "/postgres";
  const client = new pg.Client({ connectionString: u.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (!rowCount)
      await client.query(`CREATE DATABASE "${name.replaceAll('"', "")}"`);
  } finally {
    await client.end();
  }
  const env = {
    ...process.env,
    DATABASE_URL: url,
    TSUMUGI_TODAY: "2026-11-25",
  };
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env });
  execSync("pnpm exec tsx prisma/seed.ts --reset", { stdio: "inherit", env });
}
