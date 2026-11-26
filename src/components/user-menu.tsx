"use client";

import Link from "next/link";
import { useTransition } from "react";
import { LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";

export function UserMenu({
  name,
  isAdmin,
}: {
  name: string;
  isAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <details className="group relative">
      <summary
        aria-label="アカウントメニュー"
        className="hover:bg-surface-2 flex list-none items-center gap-2 rounded-lg px-2 py-1 text-sm [&::-webkit-details-marker]:hidden"
      >
        <span
          aria-hidden
          className="bg-primary-soft text-primary-soft-foreground grid size-7 place-items-center rounded-full text-xs font-semibold"
        >
          {name.slice(0, 1)}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{name}</span>
      </summary>
      <div className="bg-surface absolute right-0 z-40 mt-1 w-52 rounded-lg border p-1 shadow-lg">
        <p className="text-muted-foreground px-2.5 py-1.5 text-xs">
          {name}
          {isAdmin ? "（管理者）" : ""}
        </p>
        <Link
          href="/settings"
          className="hover:bg-surface-2 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm"
        >
          <Settings className="size-4" aria-hidden />
          設定
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => logoutAction())}
          className="hover:bg-surface-2 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm"
        >
          <LogOut className="size-4" aria-hidden />
          {pending ? "ログアウト中…" : "ログアウト"}
        </button>
      </div>
    </details>
  );
}
