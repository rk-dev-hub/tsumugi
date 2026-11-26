import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// prisma.config.ts を置くと Prisma CLI は .env を自動で読み込まないため、
// ここで dotenv を読み込む（Next.js 本体は .env を自動で読む）。
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
