"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "ライト", icon: Sun },
  { value: "dark", label: "ダーク", icon: Moon },
  { value: "system", label: "システム", icon: Monitor },
];

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

/** ライト / ダーク / システムの切り替え（設定画面とヘッダーで使う） */
export function ThemeToggle({
  initial,
  compact = false,
}: {
  initial: Theme;
  compact?: boolean;
}) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div
      role="radiogroup"
      aria-label="テーマ"
      className="bg-surface-2 inline-flex rounded-lg p-0.5"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => {
              setTheme(o.value);
              applyTheme(o.value);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors",
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            <span className={compact ? "sr-only" : undefined}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
