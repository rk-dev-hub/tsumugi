import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { countPendingApprovals } from "@/features/approval/usecase";
import { getCompany } from "@/features/common/company";
import { getTimer } from "@/features/timesheet/usecase";
import { BottomTabNav, SideNav } from "@/components/app-nav";
import { UserMenu } from "@/components/user-menu";
import { ToastProvider } from "@/components/toast";
import { TsumugiLogo } from "@/components/tsumugi/mark";
import { HeaderTimer } from "@/components/timer/header-timer";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/first-password");

  const [company, me] = await Promise.all([
    getCompany(),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { totpEnabledAt: true },
    }),
  ]);
  // 管理者・マネージャーは 2 段階認証の設定を必須にできる
  if (
    company.requireTotpForManagers &&
    user.role !== "MEMBER" &&
    !me?.totpEnabledAt
  ) {
    redirect("/setup-2fa");
  }

  const [approvals, timer] = await Promise.all([
    countPendingApprovals(user),
    getTimer(user.id),
  ]);
  const badges = { approvals };

  return (
    <ToastProvider>
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        本文へ移動
      </a>
      <div className="flex min-h-dvh">
        <aside className="bg-surface/70 sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r backdrop-blur lg:flex">
          <div className="px-4 pt-4 pb-3">
            <Link href="/" aria-label="Tsumugi ホーム">
              <TsumugiLogo className="text-base" />
            </Link>
            <p className="text-muted-foreground mt-1 truncate pl-9 text-[11px]">
              {company.name}
            </p>
          </div>
          <div className="thread-rule mx-4 mb-3" />
          <div className="flex-1 overflow-y-auto px-2.5 pb-4">
            <SideNav role={user.role} badges={badges} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
            <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 lg:px-8">
              <Link href="/" className="lg:hidden" aria-label="Tsumugi ホーム">
                <TsumugiLogo className="text-[15px]" />
              </Link>
              <div className="flex min-w-0 flex-1 justify-end lg:justify-start">
                <HeaderTimer timer={timer} />
              </div>
              <UserMenu name={user.name} isAdmin={user.role === "ADMIN"} />
            </div>
          </header>
          <main
            id="main"
            className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 lg:px-8 lg:pb-12"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomTabNav role={user.role} badges={badges} />
    </ToastProvider>
  );
}
