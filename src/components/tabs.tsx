import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL のクエリで切り替えるタブ（リンクなので戻る・共有がそのまま効く）。 */
export function LinkTabs({
  tabs,
  current,
  className,
}: {
  tabs: Array<{ key: string; label: string; href: string; count?: number }>;
  current: string;
  className?: string;
}) {
  return (
    <nav aria-label="表示の切り替え" className={cn("border-b", className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((t) => {
          const active = t.key === current;
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t.label}
                {t.count ? (
                  <span className="bg-surface-2 tabular rounded px-1.5 text-xs">
                    {t.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
