import { useId } from "react";
import { cn } from "@/lib/utils";

/** Tsumugi のマーク: 3 本の糸が 1 本に撚り合わさる形 */
export function TsumugiMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden
      className={cn("text-tsumugi-mark size-4 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      <path d="M2.5 5.5c4 0 5 4.5 7.5 4.5" strokeWidth="1.5" opacity=".55" />
      <path d="M2.5 10h7.5" strokeWidth="1.5" opacity=".75" />
      <path d="M2.5 14.5c4 0 5-4.5 7.5-4.5" strokeWidth="1.5" opacity=".55" />
      <path d="M10 10h7.5" strokeWidth="2.4" />
      <circle cx="17.2" cy="10" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** ロゴ: グラデーションの面＋撚り糸のマーク＋文字 */
export function TsumugiLogo({
  className,
  light,
}: {
  className?: string;
  light?: boolean;
}) {
  // 同じページに複数置くとき（PC・スマホのヘッダー）に id が重ならないようにする
  const gradId = `tsumugi-logo-${useId().replace(/:/g, "")}`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        className,
      )}
    >
      <svg viewBox="0 0 28 28" aria-hidden className="size-7">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--grad-from)" />
            <stop offset=".55" stopColor="var(--grad-via)" />
            <stop offset="1" stopColor="var(--grad-to)" />
          </linearGradient>
        </defs>
        <rect
          width="28"
          height="28"
          rx="8"
          fill={light ? "rgba(255,255,255,.16)" : `url(#${gradId})`}
        />
        <g fill="none" stroke="white" strokeLinecap="round">
          <path d="M5.5 8.5c5 0 6 5.5 9 5.5" strokeWidth="1.6" opacity=".6" />
          <path d="M5.5 14h9" strokeWidth="1.6" opacity=".8" />
          <path d="M5.5 19.5c5 0 6-5.5 9-5.5" strokeWidth="1.6" opacity=".6" />
          <path d="M14.5 14h7" strokeWidth="2.6" />
        </g>
        <circle cx="21.8" cy="14" r="1.7" fill="var(--tsumugi-mark)" />
      </svg>
      <span>Tsumugi</span>
    </span>
  );
}
