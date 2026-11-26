import { cookies } from "next/headers";
import { requireUser } from "@/features/auth/rbac";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getCompany } from "@/features/common/company";
import { totpStatus } from "@/features/account/totp";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { TotpSetup } from "@/components/account/totp-setup";
import { ChangePasswordForm } from "@/app/(auth)/first-password/change-password-form";
import { DisableTotpForm } from "./disable-totp-form";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [status, company] = await Promise.all([
    totpStatus(user.id),
    getCompany(),
  ]);
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const required = company.requireTotpForManagers && user.role !== "MEMBER";
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="設定" description={`${user.name}（${user.email}）`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>パスワードの変更</CardTitle>
            <CardDescription>
              変更すると、ほかの端末を含めてログアウトします。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm from="settings" />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>2 段階認証</CardTitle>
                {status.enabled ? (
                  <Badge variant="success">有効</Badge>
                ) : (
                  <Badge>未設定</Badge>
                )}
              </div>
              <CardDescription>
                ログインのときに、認証アプリの 6 桁のコードも確認します。
                {required ? "あなたのロールでは必須です。" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {status.enabled ? (
                <div className="flex flex-col gap-3 text-sm">
                  <p>
                    未使用のリカバリーコード:{" "}
                    <span className="tabular font-medium">
                      {status.remainingRecoveryCodes}
                    </span>{" "}
                    個
                  </p>
                  {required ? (
                    <p className="text-muted-foreground text-xs">
                      認証アプリを変える場合は、管理者に 2
                      段階認証のリセットを依頼してください。
                    </p>
                  ) : (
                    <DisableTotpForm />
                  )}
                </div>
              ) : (
                <TotpSetup />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>表示</CardTitle>
              <CardDescription>画面の明るさ</CardDescription>
            </CardHeader>
            <CardContent>
              <ThemeToggle initial={theme} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
