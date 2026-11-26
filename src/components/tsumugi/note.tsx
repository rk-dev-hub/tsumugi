import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TsumugiMark } from "./mark";

/**
 * Tsumugi の発言。システムの通知と見分けがつくよう、マークと淡い琥珀の帯で表示する。
 * source が template のときは AI ではなく定型文であることを小さく示す。
 */
export function TsumugiNote({
  children,
  action,
  source,
  className,
}: {
  children: ReactNode;
  action?: { label: string; href: string } | null;
  source?: "ai" | "template";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-tsumugi-border bg-tsumugi-grad text-tsumugi-foreground flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
        className,
      )}
    >
      <TsumugiMark className="mt-0.5" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action ? (
        <Link
          href={action.href}
          className="border-tsumugi-border bg-surface hover:bg-surface-2 text-foreground shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium"
        >
          {action.label}
        </Link>
      ) : null}
      {source === "template" ? (
        <span className="sr-only">（定型文）</span>
      ) : null}
    </div>
  );
}

/** 「Tsumugi」の見出し */
export function TsumugiHeading({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <TsumugiMark />
      <h2 className="text-[15px] font-semibold">{children}</h2>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
}
