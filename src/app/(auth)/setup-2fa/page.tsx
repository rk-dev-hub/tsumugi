import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TotpSetup } from "@/components/account/totp-setup";

export const metadata = { title: "2 段階認証の設定" };

export default async function SetupTwoFactorPage() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/first-password");
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { totpEnabledAt: true },
  });
  if (me?.totpEnabledAt) redirect("/");
  return (
    <Card className="shadow-primary/5 shadow-xl">
      <CardHeader>
        <CardTitle className="text-lg">2 段階認証の設定</CardTitle>
        <CardDescription>
          管理者・マネージャーは単価や原価を扱うため、2
          段階認証の設定が必要です。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TotpSetup onDoneHref="/" />
      </CardContent>
    </Card>
  );
}
