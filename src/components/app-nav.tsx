"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  FolderKanban,
  Home,
  LayoutGrid,
  Lock,
  type LucideIcon,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Timer,
  Users,
  X,
} from "lucide-react";
import type { Role } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type Badges = { approvals: number };
type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: keyof Badges;
  minRole?: "MANAGER" | "ADMIN";
};

const MAIN: NavItem[] = [
  { href: "/", label: "ホーム", icon: Home },
  { href: "/timesheet", label: "工数", icon: Timer },
  {
    href: "/approvals",
    label: "承認",
    icon: ClipboardCheck,
    badge: "approvals",
    minRole: "MANAGER",
  },
  { href: "/projects", label: "プロジェクト", icon: FolderKanban },
  { href: "/reports", label: "レポート", icon: BarChart3 },
];

const ADMIN: NavItem[] = [
  { href: "/admin/closing", label: "月次締め", icon: Lock },
  { href: "/admin/users", label: "ユーザー・単価", icon: Users },
  { href: "/admin/masters", label: "部署・顧客・分類", icon: Building2 },
  { href: "/admin/company", label: "会社設定・休日", icon: SlidersHorizontal },
  { href: "/admin/audit", label: "監査ログ", icon: ScrollText },
];

function allowed(role: Role, item: NavItem) {
  if (!item.minRole) return true;
  if (item.minRole === "ADMIN") return role === "ADMIN";
  return role !== "MEMBER";
}

const SETTINGS: NavItem = { href: "/settings", label: "設定", icon: Settings };

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  badges,
  onNavigate,
}: {
  item: NavItem;
  badges: Badges;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const count = item.badge ? badges[item.badge] : 0;
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
        active
          ? "bg-grad-soft text-primary-soft-foreground font-medium shadow-[inset_2px_0_0_var(--grad-via)]"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {count > 0 ? (
        <span
          className="bg-grad tabular min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 text-white"
          aria-label={`${count} 件`}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function NavSections({
  role,
  badges,
  onNavigate,
}: {
  role: Role;
  badges: Badges;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">
        {MAIN.filter((i) => allowed(role, i)).map((i) => (
          <li key={i.href}>
            <NavLink item={i} badges={badges} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      {role === "ADMIN" ? (
        <div>
          <p className="text-muted-foreground mb-1.5 px-2.5 text-[11px] font-medium tracking-wider">
            管理
          </p>
          <ul className="flex flex-col gap-0.5">
            {ADMIN.map((i) => (
              <li key={i.href}>
                <NavLink item={i} badges={badges} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul>
        <li>
          <NavLink item={SETTINGS} badges={badges} onNavigate={onNavigate} />
        </li>
      </ul>
    </div>
  );
}

/** PC: 左のサイドナビ */
export function SideNav({ role, badges }: { role: Role; badges: Badges }) {
  return (
    <nav aria-label="メインメニュー">
      <NavSections role={role} badges={badges} />
    </nav>
  );
}

/** スマホ: 下部タブ（ホーム / 工数 / 承認 or プロジェクト / レポート / その他） */
export function BottomTabNav({ role, badges }: { role: Role; badges: Badges }) {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();
  useEffect(() => close(), [pathname]);

  const TABS =
    role === "MEMBER"
      ? [MAIN[0], MAIN[1], MAIN[3], MAIN[4]]
      : [MAIN[0], MAIN[1], MAIN[2], MAIN[3]];
  const otherCount = 0;
  const tabActive = TABS.some((t) => isActive(pathname, t.href));

  return (
    <>
      <nav
        aria-label="メインメニュー"
        className="bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            const count = t.badge ? badges[t.badge] : 0;
            const Icon = t.icon;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex flex-col items-center gap-0.5 py-2 text-[11px]",
                    active
                      ? "text-primary font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {t.label}
                  {count > 0 ? (
                    <span className="bg-primary text-primary-foreground absolute top-1 left-1/2 ml-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4">
                      {count > 99 ? "99+" : count}
                      <span className="sr-only"> 件</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => dialog.current?.showModal()}
              className={cn(
                "relative flex w-full flex-col items-center gap-0.5 py-2 text-[11px]",
                !tabActive
                  ? "text-primary font-medium"
                  : "text-muted-foreground",
              )}
            >
              <LayoutGrid className="size-5" aria-hidden />
              その他
              {otherCount > 0 ? (
                <span className="bg-primary absolute top-1.5 left-1/2 ml-2 size-2 rounded-full">
                  <span className="sr-only">未処理あり</span>
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>
      <dialog
        ref={dialog}
        aria-label="メニュー"
        className="bg-surface text-foreground mt-auto mb-0 max-h-[85vh] w-full max-w-none rounded-t-2xl border-t p-0 backdrop:bg-black/40 lg:hidden"
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
      >
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-sm font-medium">メニュー</span>
          <button
            type="button"
            onClick={close}
            className="rounded p-1"
            aria-label="閉じる"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="px-3 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <NavSections role={role} badges={badges} onNavigate={close} />
        </div>
      </dialog>
    </>
  );
}
