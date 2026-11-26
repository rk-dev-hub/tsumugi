/**
 * 体験用データを入れずに、管理者 1 名だけを作る。
 *
 *   pnpm create:admin --email you@example.com --password '12文字以上のパスワード' --name 管理者
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { createPrismaClient } from "@/lib/prisma";
import { hashPassword, isAcceptablePassword } from "@/lib/password";

const prisma = createPrismaClient();

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      password: { type: "string" },
      name: { type: "string" },
    },
  });
  const email = (values.email ?? "").trim().toLowerCase();
  const password = values.password ?? "";
  const name = values.name ?? "管理者";
  if (!email || !isAcceptablePassword(password)) {
    console.error("--email と 12 文字以上の --password を指定してください。");
    process.exit(1);
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`ユーザー ${email} はすでに存在します。`);
    process.exit(1);
  }
  await prisma.company.upsert({
    where: { id: 1 },
    create: { id: 1, name: "自社" },
    update: {},
  });
  const admin = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await hashPassword(password),
      role: "ADMIN",
      mustChangePassword: true,
    },
  });
  console.log(
    `管理者を作成しました: ${admin.email}（初回ログインでパスワードを変更します）`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
