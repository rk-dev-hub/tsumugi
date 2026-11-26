import { execSync } from "node:child_process";
import pg from "pg";
import "./env";

/** テスト用 DB がなければ作り、マイグレーションを当てる */
export default async function setup() {
  const url = new URL(process.env.DATABASE_URL!);
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
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
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
}
