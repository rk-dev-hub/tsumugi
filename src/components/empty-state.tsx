import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** データがないとき。次に何をすればよいかを書く。 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon className="text-muted-foreground size-6" aria-hidden />
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {children ? (
        <div className="text-muted-foreground max-w-sm text-sm">{children}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-surface-2 animate-pulse rounded-md", className)}
    />
  );
}
